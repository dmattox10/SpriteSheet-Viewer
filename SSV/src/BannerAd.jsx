import { useEffect, useRef, useState } from 'react'
import { fetchBannerAd, sendAdEvent } from './adManifest'
import { SLOT_SIZES, usePageSlots } from './adSlots'

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
// One fetch per page per mount, and nothing that re-fetches on a re-render —
// uploading a file or toggling the theme must not cost another request, and a
// banner that reshuffles while someone is reading it is an impression nobody
// finished.
//
// `undefined` is the pending state and `null` is the settled empty one, and
// they are distinguished so the slot can hold its height while the request is
// in flight and then collapse cleanly if there is nothing to draw. Reserving
// the space permanently would leave a gap on every page where an ad blocker
// ate the request; not reserving it at all would shift the whole page down
// the moment the ad arrived.
//
// The request is shared between the slots and so is not aborted on unmount —
// see adManifest.js. `live` still guards the setState, which is the part that
// would otherwise warn about a gone component.
function useAd(slot, pageSlots) {
    const [ad, setAd] = useState(undefined)
    const key = pageSlots.join(',')

    useEffect(() => {
        let live = true
        setAd(undefined)
        fetchBannerAd(slot, key.split(',')).then((result) => {
            if (live) setAd(result ?? null)
        })
        return () => {
            live = false
        }
    }, [slot, key])

    return ad
}

// The project carries no prop-types dependency and declares none anywhere
// else, and adding one for three strings would be a package nobody asked for.
/* eslint-disable-next-line react/prop-types */
export default function BannerAd({ slot, placement }) {
    // Every slot asks about the whole page, not only about itself, so the
    // service can answer them as a set — which is what keeps "YOUR AD HERE"
    // to one of them.
    const { all } = usePageSlots()

    const size = SLOT_SIZES[slot]
    const ad = useAd(slot, all)
    const imgRef = useRef(null)
    // Which ad this instance has already reported as seen. A ref so reporting
    // does not cause a render, and so it survives React's development
    // double-invoke of the effect without counting the same ad twice.
    const viewedFor = useRef(null)

    // A view is the creative actually being on screen, which only the page can
    // know. Half the image is the threshold: a banner clipped by the bottom of
    // a viewport is not one anybody read, and the observer disconnects after
    // the first report so one reader cannot become several on a scroll.
    useEffect(() => {
        const img = imgRef.current
        if (!img || !ad?.adId) return undefined
        if (typeof IntersectionObserver !== 'function') return undefined

        let loaded = img.complete && img.naturalWidth > 0
        let inView = false

        const fire = () => {
            if (viewedFor.current === ad.adId) return
            viewedFor.current = ad.adId
            sendAdEvent(ad, slot, 'view')
        }

        const onLoad = () => {
            loaded = true
            if (inView) fire()
        }

        const observer = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    inView = entry.isIntersecting && entry.intersectionRatio >= 0.5
                    if (inView && loaded) fire()
                }
            },
            { threshold: [0.5] }
        )

        img.addEventListener('load', onLoad)
        observer.observe(img)

        return () => {
            img.removeEventListener('load', onLoad)
            observer.disconnect()
        }
    }, [ad, slot])

    const onAdClick = () => {
        // Fired before the browser follows the link; sendAdEvent uses
        // sendBeacon first, which is what survives the navigation.
        sendAdEvent(ad, slot, 'click')
    }

    if (!size) return null
    // Settled with nothing to show: the slot collapses rather than drawing a
    // bordered empty box. Two grey rectangles on a tool's page read as a
    // layout that failed to load, which costs more trust than the slot earns.
    if (ad === null) return null

    const creative = ad ? (
        <img
            ref={imgRef}
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
                onClick={onAdClick}
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
