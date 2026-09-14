// GA4 event layer.
//
// One copy of this file lives in every front end on this box. They are
// separate Vite builds with separate Docker build contexts (see each app's
// Dockerfile — the context is the app directory, nothing above it), so there
// is nowhere shared to import from. The copies are deliberately identical
// apart from SITE_ID and the app-specific helpers at the bottom; when the
// contract changes, change it everywhere. `docs/ANALYTICS.md` in site-analytics
// is the spec these copies implement.
//
// Everything here no-ops when gtag is absent — ad blockers, offline dev, and
// the iOS/Android bundles that must never phone home (see the Capacitor
// web-build gating note). Nothing in this file may throw.

const SITE_ID = 'ssv';

// Every event carries `site` so the cross-site dashboard can group twenty
// properties by one dimension instead of twenty report calls.
function base() {
    return { site: SITE_ID };
}

function ready() {
    return typeof window !== 'undefined' && typeof window.gtag === 'function';
}

export function track(name, params = {}) {
    if (!ready()) return;
    try {
        window.gtag('event', name, { ...base(), ...params });
    } catch {
        // Analytics must never break the page it measures.
    }
}

// Back-compat alias: several apps already import trackEvent.
export const trackEvent = track;

// --- Page views -------------------------------------------------------------
//
// These apps are single-page and mostly do NOT change location.pathname when
// they advance — they swap a step in a zustand store. GA4's automatic
// page_view therefore fires once per visit and every funnel stage collapses
// into one "page". virtualPageView() gives each stage its own page so
// Engagement > Pages, and every path exploration, tell the truth.

let lastVirtualPath = null;

export function virtualPageView(path, title) {
    if (!ready() || path === lastVirtualPath) return;
    lastVirtualPath = path;
    track('page_view', {
        page_path: path,
        page_location: `${window.location.origin}${path}`,
        page_title: title || document.title,
    });
}

// --- Engagement -------------------------------------------------------------
//
// GA4's enhanced measurement fires `scroll` once, at 90%. That answers "did
// they reach the bottom" and nothing else. These two give the shape of the
// visit, which for the demo sites is the whole point: what did they look at
// and for how long.

export function initScrollDepth(thresholds = [25, 50, 75, 100]) {
    if (typeof window === 'undefined') return () => {};
    const hit = new Set();
    const onScroll = () => {
        const doc = document.documentElement;
        const scrollable = doc.scrollHeight - window.innerHeight;
        if (scrollable <= 0) return;
        const pct = Math.min(100, Math.round((window.scrollY / scrollable) * 100));
        for (const t of thresholds) {
            if (pct >= t && !hit.has(t)) {
                hit.add(t);
                track('scroll_depth', { percent: t });
            }
        }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
}

// Time a visitor actually spent with a section on screen, reported once per
// section when the page is hidden. Sections are found by [data-section="name"].
// Blurred tabs and backgrounded phones are excluded, so this is attention,
// not elapsed wall-clock.
export function initSectionEngagement() {
    if (typeof window === 'undefined' || typeof IntersectionObserver === 'undefined') return () => {};

    const seen = new Map(); // name -> { ms, enteredAt }
    let pageHidden = document.visibilityState === 'hidden';

    const entry = (name) => {
        if (!seen.has(name)) seen.set(name, { ms: 0, enteredAt: null, viewed: false });
        return seen.get(name);
    };

    const startTiming = (name) => {
        const e = entry(name);
        if (e.enteredAt === null && !pageHidden) e.enteredAt = performance.now();
    };
    const stopTiming = (name) => {
        const e = entry(name);
        if (e.enteredAt !== null) {
            e.ms += performance.now() - e.enteredAt;
            e.enteredAt = null;
        }
    };

    const observer = new IntersectionObserver((entries) => {
        for (const ent of entries) {
            const name = ent.target.dataset.section;
            if (!name) continue;
            if (ent.isIntersecting) {
                const e = entry(name);
                if (!e.viewed) {
                    e.viewed = true;
                    track('section_view', { section: name });
                }
                startTiming(name);
            } else {
                stopTiming(name);
            }
        }
    }, { threshold: 0.5 });

    const observeAll = () => {
        document.querySelectorAll('[data-section]').forEach((el) => observer.observe(el));
    };
    observeAll();

    // Sections mount and unmount as the flow advances, so re-scan on DOM
    // changes rather than only at startup.
    const mo = new MutationObserver(observeAll);
    mo.observe(document.body, { childList: true, subtree: true });

    const onVisibility = () => {
        if (document.visibilityState === 'hidden') {
            pageHidden = true;
            seen.forEach((_, name) => stopTiming(name));
            flush();
        } else {
            pageHidden = false;
        }
    };

    let flushed = false;
    const flush = () => {
        if (flushed) return;
        flushed = true;
        seen.forEach((e, name) => {
            const seconds = Math.round(e.ms / 1000);
            if (seconds >= 1) track('section_time', { section: name, seconds });
        });
    };

    document.addEventListener('visibilitychange', onVisibility);
    // pagehide, not unload: unload is ignored by the back/forward cache and
    // never fires on iOS Safari.
    window.addEventListener('pagehide', () => { seen.forEach((_, n) => stopTiming(n)); flush(); });

    return () => {
        observer.disconnect();
        mo.disconnect();
        document.removeEventListener('visibilitychange', onVisibility);
    };
}

// --- Intent -----------------------------------------------------------------

export function trackCta(label, location) {
    track('cta_click', { cta: label, location: location || 'unknown' });
}

export function trackOutbound(url, label) {
    track('outbound_click', { link_url: url, link_label: label || url });
}

export function trackFormStart(form) {
    track('form_start', { form_name: form });
}

export function trackFormError(form, field, message) {
    track('form_error', { form_name: form, field: field || 'form', reason: message || 'invalid' });
}

export function trackFormSubmit(form) {
    track('form_submit', { form_name: form });
}

// --- Ecommerce --------------------------------------------------------------
//
// These are the GA4 reserved ecommerce names and the reserved `items` shape.
// Getting the names right is the entire point: GA4 only populates its revenue
// and funnel reports from `purchase` / `begin_checkout` / `add_to_cart`, and a
// custom name like `booking_purchase_success` leaves them reading zero.

function normalizeItems(items = []) {
    return items.map((i, index) => ({
        item_id: String(i.item_id ?? i.id ?? `item_${index}`),
        item_name: String(i.item_name ?? i.name ?? i.label ?? 'Unnamed item'),
        item_category: i.item_category ?? i.category ?? undefined,
        price: typeof i.price === 'number' ? Number(i.price.toFixed(2)) : undefined,
        quantity: i.quantity ?? 1,
        index,
    }));
}

export function viewItemList(items, listName) {
    track('view_item_list', { item_list_name: listName, items: normalizeItems(items) });
}

export function viewItem(item, currency = 'USD') {
    const [normalized] = normalizeItems([item]);
    track('view_item', { currency, value: normalized.price ?? 0, items: [normalized] });
}

export function selectItem(item, listName) {
    track('select_item', { item_list_name: listName, items: normalizeItems([item]) });
}

export function addToCart(items, value, currency = 'USD') {
    track('add_to_cart', { currency, value: Number((value || 0).toFixed(2)), items: normalizeItems(items) });
}

export function beginCheckout({ items = [], value = 0, currency = 'USD' } = {}) {
    track('begin_checkout', { currency, value: Number(value.toFixed(2)), items: normalizeItems(items) });
}

// Fired on the post-payment return page. `transactionId` MUST be stable and
// match the row the books are kept in, so GA revenue can be reconciled against
// the database rather than believed on its own.
export function purchase({ transactionId, value = 0, currency = 'USD', items = [], tax, shipping } = {}) {
    if (!transactionId) return;
    // A customer who refreshes the confirmation page, or reaches it twice from
    // an emailed link, must not be counted twice. GA4 dedupes on
    // transaction_id but only within a short window, so guard locally too.
    const key = `ga4_purchase_${transactionId}`;
    try {
        if (window.sessionStorage.getItem(key)) return;
        window.sessionStorage.setItem(key, '1');
    } catch {
        // Private mode / storage disabled: fall through and send. A possible
        // double-count beats silently losing every purchase.
    }
    track('purchase', {
        transaction_id: transactionId,
        currency,
        value: Number(value.toFixed(2)),
        tax,
        shipping,
        items: normalizeItems(items),
    });
}

export function refund({ transactionId, value, currency = 'USD' } = {}) {
    if (!transactionId) return;
    track('refund', { transaction_id: transactionId, currency, value });
}

// Lead-gen sites take no payment, so `purchase` never fires for them and a
// revenue column would stay empty. generate_lead is the GA4 reserved event
// that fills the same slot: it is a key event and it carries a value, so a
// lead can be priced.
export function generateLead({ method, value, currency = 'USD' } = {}) {
    track('generate_lead', { method: method || 'form', value, currency });
}

export function signUpEvent(method) {
    track('sign_up', { method: method || 'site' });
}

export function loginEvent(method) {
    track('login', { method: method || 'site' });
}
