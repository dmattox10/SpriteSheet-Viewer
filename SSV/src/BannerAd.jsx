import { useEffect, useState } from 'react'
import { fetchBannerAd } from './adManifest'

// An ad slot on the viewer page.
//
// Both placements on this page are horizontal or boxy and sit in the normal
// document flow, above and below the work area. That is not a style
// preference: the sprite sheet is drawn at its own pixel size, which is
// routinely wider than this container and must not be scaled, so it is the
// one element on the page that owns its space completely. A skyscraper down
// either side would be taking width from a 2048px atlas, and an ad that
// makes the tool worse at its job is worth less than the space it occupies.
//
// The shapes come from the ad service's own inventory (SITES.ssv in
// src/services/inventory.js there) and this table repeats them so the slot
// can reserve the right space before the network answers. They have to agree:
// a slot drawn at a size nobody can buy is a slot nobody can fill.
const SLOT_SIZES = {
    top: { width: 728, height: 90 },
    'top-mobile': { width: 320, height: 50 },
    side: { width: 300, height: 250 },
}

// The viewport width at which a 728x90 fits with the page's gutters intact
// (20px of body padding and 20px of container padding, both sides) and a
// little room to spare. Below it the leaderboard would have to scale down,
// and an advertiser's wordmark at 44px tall is an impression nobody reads, so
// the phone banner is fetched instead — a different slot, sold separately.
const LEADERBOARD_MIN_WIDTH = 860

function useIsNarrow(maxWidth) {
    const [narrow, setNarrow] = useState(
        () => typeof window !== 'undefined' && window.innerWidth < maxWidth
    )

    useEffect(() => {
        const mq = window.matchMedia(`(max-width: ${maxWidth - 1}px)`)
        const onChange = (e) => setNarrow(e.matches)
        setNarrow(mq.matches)
        mq.addEventListener('change', onChange)
        return () => mq.removeEventListener('change', onChange)
    }, [maxWidth])

    return narrow
}

// One fetch per slot per mount, and nothing that re-fetches on a re-render —
// uploading a file or toggling the theme must not cost another request, and
// a banner that reshuffles while someone is reading it is an impression
// nobody finished.
//
// The abort on unmount is not tidiness: the fetch resolving afterwards would
// set state on a gone component.
//
// `undefined` is the pending state and `null` is the settled empty one, and
// they are distinguished so the slot can hold its height while the request is
// in flight and then collapse cleanly if there is nothing to draw. Reserving
// the space permanently would leave a gap on every page where an ad blocker
// ate the request; not reserving it at all would shift the whole page down
// the moment the ad arrived.
function useAd(slot) {
    const [ad, setAd] = useState(undefined)

    useEffect(() => {
        const controller = new AbortController()
        let live = true
        setAd(undefined)
        fetchBannerAd(slot, { signal: controller.signal }).then((result) => {
            if (live) setAd(result ?? null)
        })
        return () => {
            live = false
            controller.abort()
        }
    }, [slot])

    return ad
}

// The project carries no prop-types dependency and declares none anywhere
// else, and adding one for three strings would be a package nobody asked for.
/* eslint-disable-next-line react/prop-types */
export default function BannerAd({ slot, mobileSlot, placement }) {
    // A leaderboard with a phone variant asks for whichever one its current
    // width can actually draw. Both are real slots in the inventory, so this
    // is a choice between two things that can be sold rather than a resize of
    // one of them.
    const narrow = useIsNarrow(LEADERBOARD_MIN_WIDTH)
    const active = narrow && mobileSlot ? mobileSlot : slot

    const size = SLOT_SIZES[active]
    const ad = useAd(active)

    if (!size) return null
    // Settled with nothing to show: the slot collapses rather than drawing a
    // bordered empty box. Two grey rectangles on a tool's page read as a
    // layout that failed to load, which costs more trust than the slot earns.
    if (ad === null) return null

    const creative = ad ? (
        <img
            className="banner-ad-image"
            src={ad.imageUrl}
            alt={ad.alt}
            width={size.width}
            height={size.height}
            // The least important bytes on the page: the sheet the visitor
            // came to look at gets the connection first.
            loading="lazy"
            decoding="async"
        />
    ) : null

    // A bought banner may have no click target — a brand ad that goes
    // nowhere is a real purchase — and a link to nothing is worse than no
    // link, so the anchor is conditional.
    //
    // `noopener` is what stops the opened tab reaching back through
    // window.opener, and `nofollow sponsored` is what a paid link is required
    // to say.
    const linked =
        ad && ad.href ? (
            <a
                className="banner-ad-link"
                href={ad.href}
                target="_blank"
                rel="noopener noreferrer nofollow sponsored"
            >
                {creative}
            </a>
        ) : (
            creative
        )

    return (
        // <aside>, because that is what this is and because a screen reader
        // should be able to skip it. The label stays even while the creative
        // is our own house filler: a slot that says it is an ad before it
        // holds somebody else's is one where the disclosure never has to be
        // remembered.
        <aside
            className={`banner-ad banner-ad--${placement}`}
            style={{ minHeight: size.height }}
        >
            {ad && <span className="banner-ad-label">Advertisement</span>}
            {linked}
        </aside>
    )
}
