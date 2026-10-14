// Fetching a banner from the ad service (ads.hyperspacemediagroup.com).
//
// The whole boundary between this tool and the ad service is this one file,
// and it is deliberately total: every failure resolves to `null`, and `null`
// means the slot draws nothing. There is no error state, because an ad slot
// has nothing useful to say to someone converting a sprite sheet about an
// advertising service being down.
//
// Why the client fetches rather than the build baking it in: a booking starts
// and ends on dates nobody deploys around. A manifest in the bundle would
// mean a paid week began at the next deploy of this site and ended at the one
// after that, which is not the week that was sold.
//
// The service answers `{ ad: null }` with a 200 for an unsold, unapproved or
// expired slot, and by default fills an empty slot with its own house
// creative instead — so the ordinary unsold case is a rendered "your ad here"
// rather than a hole. Nothing it returns was published by a Stripe payment
// alone; a person approves every booking in the service's own admin, and that
// rule lives there because it could not be enforced from here.

// Overridable at build time so a local checkout can point somewhere else, or
// switch the slots off entirely with an empty value. Vite inlines this at
// build, which is why the production default is written here rather than
// being required in the environment of every build that wants ads.
const ADS_BASE_URL =
    import.meta.env.VITE_ADS_BASE_URL ?? 'https://ads.hyperspacemediagroup.com'

const SITE = 'ssv'

// A placement, flattened out of the manifest's shape so the component renders
// a sold ad and a house ad through the same path and cannot come to depend on
// which one it got.
//
// `alt` is used exactly as the advertiser typed it. This site has no
// translation layer, but it would not translate it if it had one — somebody
// else's ad copy is not ours to rewrite.
function toPlacement(ad) {
    if (!ad?.imageUrl) return null
    return {
        imageUrl: ad.imageUrl,
        alt: ad.alt || '',
        // An ad with no click target is a legitimate purchase — a brand
        // banner that goes nowhere. The component renders the image bare
        // rather than wrapping it in a link to nothing.
        href: ad.clickUrl || null,
    }
}

// One request for the whole page, shared by every slot on it.
//
// **The page asks about its slots together because the house ad is one per
// page, not one per slot.** Asked separately, each empty slot was told it
// could show "YOUR AD HERE" — true of each slot and wrong for the page, which
// then said it twice and read as a site with no advertisers rather than as an
// invitation. The service can only apply a per-page rule to a request that
// describes the page.
//
// Single-flighted on the slot list rather than fetched per component, so the
// two banners share one request and one answer. Without this they would race
// and each would be answered as if it were the only slot being drawn.
let inflight = null

function fetchPageAds(slots) {
    const key = slots.join(',')
    if (inflight?.key === key) return inflight.promise

    // Deliberately no AbortSignal. The request belongs to the page rather
    // than to either component, and aborting it when one of them unmounts
    // would cancel the other's answer mid-flight.
    const promise = (async () => {
        try {
            const url = `${ADS_BASE_URL}/api/manifest-page?site=${SITE}&slots=${encodeURIComponent(key)}`
            const res = await fetch(url, { credentials: 'omit' })
            if (!res.ok) return {}
            const body = await res.json()
            return body?.ads ?? {}
        } catch {
            return {}
        }
    })()

    inflight = { key, promise }
    return promise
}

export async function fetchBannerAd(slot, pageSlots) {
    // No configured service is the normal state in a checkout nobody has
    // pointed at one. Not an error, and not worth a request.
    if (!ADS_BASE_URL) return null

    try {
        const ads = await fetchPageAds(pageSlots?.length ? pageSlots : [slot])
        // A slot the page asked about and the service answered `null` for is
        // an ordinary empty slot — on this page, usually the one that did not
        // get the single house turn.
        return toPlacement(ads[slot])
    } catch {
        // Offline, DNS, CORS, a blocked request, malformed JSON, an aborted
        // fetch on unmount — every one means the same thing to this slot,
        // which is that there is nothing to show. An ad blocker is the most
        // likely of them, and someone running one has made their preference
        // clear; the slot collapsing is the right answer rather than a
        // fallback that argues with them.
        return null
    }
}
