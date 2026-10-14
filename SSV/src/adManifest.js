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

export async function fetchBannerAd(slot, { signal } = {}) {
    // No configured service is the normal state in a checkout nobody has
    // pointed at one. Not an error, and not worth a request.
    if (!ADS_BASE_URL) return null

    try {
        const url = `${ADS_BASE_URL}/api/manifest?site=${SITE}&slot=${encodeURIComponent(slot)}`
        const res = await fetch(url, { signal, credentials: 'omit' })
        if (!res.ok) return null
        const body = await res.json()
        return toPlacement(body?.ad)
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
