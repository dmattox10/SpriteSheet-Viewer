import { useState, useEffect } from 'react'

// What this page's ad slots are, and which of them it is drawing right now.
//
// Separate from BannerAd.jsx because App.jsx needs the slot list too: both
// banners have to ask the ad service about the same set, or the service
// cannot apply a rule about the page to them. A hook and a table living in
// the component file also break fast refresh for the component.

// The shapes come from the ad service's own inventory (SITES.ssv in
// src/services/inventory.js there) and this table repeats them so the slot
// can reserve the right space before the network answers. They have to agree:
// a slot drawn at a size nobody can buy is a slot nobody can fill.
export const SLOT_SIZES = {
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

// The slots this page draws, which is what the service has to be told in
// order to apply a rule about the page.
//
// `top` and `top-mobile` are one placement at two breakpoints and only ever
// one of them is rendered, so the list is resolved here rather than guessed
// at by the service — a site-level guess would hand the single house turn to
// a slot this visitor's viewport never draws, and the page would show no
// invitation at all.
export function usePageSlots() {
    const narrow = useIsNarrow(LEADERBOARD_MIN_WIDTH)
    const leaderboard = narrow ? 'top-mobile' : 'top'
    return { leaderboard, rectangle: 'side', all: [leaderboard, 'side'] }
}
