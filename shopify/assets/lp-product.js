/* Wishluck LP Builder — variant picker, AJAX add to cart, sticky bar. ~3KB, no dependencies. */
(() => {
  if (window.__lpInit) return; window.__lpInit = true;
  const fmt = (cents, el) => {
    const cur = el.dataset.currency || 'INR', loc = el.dataset.locale || 'en-IN';
    try { return new Intl.NumberFormat(loc, { style: 'currency', currency: cur, maximumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100); } catch { return (cents / 100).toFixed(2); }
  };
  class LpBuyForm extends HTMLElement {
    connectedCallback() {
      this.form = this.querySelector('form'); this.scope = this.closest('.lp') || this;
      const data = this.querySelector('[data-lp-variants]');
      this.variants = data ? JSON.parse(data.textContent) : [];
      this.addEventListener('change', (e) => {
        if (e.target.matches('[data-lp-option]')) this.onOption();
        if (e.target.matches('[data-lp-variant-select]')) this.setVariant(this.variants.find((v) => String(v.id) === e.target.value));
      });
      this.querySelectorAll('[data-lp-qty]').forEach((b) => b.addEventListener('click', () => {
        const i = this.querySelector('input[name="quantity"]'); i.value = Math.max(1, (+i.value || 1) + +b.dataset.lpQty);
      }));
      this.form?.addEventListener('submit', (e) => this.onSubmit(e));
      this.markUnavailable();
    }
    selected() {
      const groups = {}; this.querySelectorAll('[data-lp-option]:checked, select[data-lp-option]').forEach((i) => groups[i.dataset.lpOption] = i.value);
      return Object.keys(groups).sort().map((k) => groups[k]);
    }
    onOption() {
      const sel = this.selected();
      this.querySelectorAll('[data-lp-opt-label]').forEach((l, i) => l.textContent = sel[i] ?? '');
      this.setVariant(this.variants.find((v) => v.options.every((o, i) => o === sel[i])));
      this.markUnavailable();
    }
    markUnavailable() {
      const sel = this.selected();
      this.querySelectorAll('[data-lp-option][type=radio]').forEach((inp) => {
        const idx = +inp.dataset.lpOption; const test = [...sel]; test[idx] = inp.value;
        const ok = this.variants.some((v) => v.available && v.options.every((o, i) => o === test[i]));
        inp.nextElementSibling?.classList.toggle('is-unavailable', !ok);
      });
    }
    setVariant(v) {
      const btn = this.querySelector('[data-lp-atc]'), label = this.querySelector('[data-lp-atc-label]');
      if (!v) { btn.disabled = true; label.textContent = this.dataset.unavailable || 'Unavailable'; return; }
      this.querySelector('[data-lp-variant-id]').value = v.id;
      btn.disabled = !v.available; label.textContent = v.available ? this.dataset.atc : this.dataset.soldout;
      const price = this.scope.querySelector('[data-lp-price]'); if (price) price.textContent = fmt(v.price, this);
      const was = this.scope.querySelector('[data-lp-compare]'), save = this.scope.querySelector('[data-lp-save]');
      const onSale = v.compare_at_price > v.price;
      if (was) { was.textContent = onSale ? fmt(v.compare_at_price, this) : ''; was.hidden = !onSale; }
      if (save) { save.textContent = onSale ? Math.round((v.compare_at_price - v.price) * 100 / v.compare_at_price) + '% off' : ''; save.hidden = !onSale; }
      if (v.featured_image && this.dataset.media) {
        const slide = document.querySelector(`#${this.dataset.media} [data-media-id="${v.featured_media?.id}"]`);
        slide?.parentElement?.scrollTo({ left: slide.offsetLeft, behavior: 'smooth' });
      }
      if (this.dataset.updateUrl === 'true' && history.replaceState) { const u = new URL(location.href); u.searchParams.set('variant', v.id); history.replaceState({}, '', u); }
      document.dispatchEvent(new CustomEvent('lp:variant', { detail: { variant: v, source: this } }));
    }
    async onSubmit(e) {
      if (this.dataset.afterAdd === 'cart') return; // native form post -> /cart
      e.preventDefault();
      const btn = this.querySelector('[data-lp-atc]'); btn.disabled = true; btn.setAttribute('aria-busy', 'true');
      try {
        const res = await fetch((window.Shopify?.routes?.root || '/') + 'cart/add.js', { method: 'POST', headers: { Accept: 'application/json' }, body: new FormData(this.form) });
        const data = await res.json();
        if (!res.ok) throw new Error(data.description || data.message || 'Could not add to cart');
        document.dispatchEvent(new CustomEvent('lp:added', { detail: data }));
        this.toast(`${data.product_title || 'Item'} added to cart.`, true);
        fetch((window.Shopify?.routes?.root || '/') + 'cart.js').then((r) => r.json()).then((c) => {
          document.querySelectorAll('.cart-count-bubble span[aria-hidden], [data-cart-count]').forEach((el) => el.textContent = c.item_count);
        }).catch(() => {});
      } catch (err) { this.toast(err.message, false); }
      finally { btn.disabled = false; btn.removeAttribute('aria-busy'); }
    }
    toast(msg, ok) {
      document.querySelector('.lp-toast')?.remove();
      const t = document.createElement('div'); t.className = 'lp-toast'; t.setAttribute('role', 'status');
      t.innerHTML = `<span></span>${ok ? `<a href="${(window.Shopify?.routes?.root || '/')}cart">View cart</a>` : ''}`;
      t.firstChild.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 4500);
    }
  }
  customElements.define('lp-buy-form', LpBuyForm);

  // sticky bar: show when the main ATC is out of view
  class LpSticky extends HTMLElement {
    connectedCallback() {
      const target = document.querySelector('[data-lp-main-atc]');
      if (!target || !('IntersectionObserver' in window)) { this.classList.add('is-visible'); return; }
      new IntersectionObserver(([e]) => this.classList.toggle('is-visible', !e.isIntersecting && e.boundingClientRect.top < 0)).observe(target);
      document.addEventListener('lp:variant', (e) => {
        if (e.detail.source.closest('lp-sticky-atc')) return;
        const sel = this.querySelector('[data-lp-variant-select]'); if (sel) { sel.value = e.detail.variant.id; sel.dispatchEvent(new Event('change', { bubbles: true })); }
      });
    }
  }
  customElements.define('lp-sticky-atc', LpSticky);

  // media track thumbnails
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-lp-thumb]'); if (!t) return;
    const slide = document.getElementById(t.dataset.lpThumb); slide?.parentElement?.scrollTo({ left: slide.offsetLeft, behavior: 'smooth' });
  });
})();
