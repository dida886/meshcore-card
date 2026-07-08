import type { HomeAssistant } from "./types.js";
import { STYLES } from "./styles.js";

export abstract class MeshcoreBaseCard extends HTMLElement {
  protected _hass?: HomeAssistant;
  protected _config?: Record<string, any>;
  protected _fp: string | null = null;
  protected _lastRender = 0;
  protected _renderTimer: ReturnType<typeof setTimeout> | null = null;
  protected _trimTimer: ReturnType<typeof requestAnimationFrame> | null = null;

  protected abstract _additionalStyles(): string;
  protected abstract _render(): void;

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.shadowRoot!.addEventListener("click", (e: Event) => {
      const target = e.target as HTMLElement;
      if (target.closest(".action-btn") || target.closest(".filter-btn")) return;
      const el = target.closest("[data-entity]") as HTMLElement | null;
      if (el?.dataset["entity"]) {
        const event = new Event("hass-more-info", { bubbles: true, composed: true });
        (event as any).detail = { entityId: el.dataset["entity"] };
        this.dispatchEvent(event);
      }
    });
  }

  disconnectedCallback() {
    if (this._renderTimer) {
      clearTimeout(this._renderTimer);
      this._renderTimer = null;
    }
    if (this._trimTimer) {
      cancelAnimationFrame(this._trimTimer);
      this._trimTimer = null;
    }
  }

  /** Podklasy mogą nadpisać, aby zdefiniować własny fingerprint. */
  protected _computeFingerprint(): string {
    return "";
  }

  set hass(hass: HomeAssistant) {
    this._hass = hass;
    const fp = this._computeFingerprint();
    if (fp === this._fp) return;
    this._fp = fp;
    const now = Date.now();
    if (now - this._lastRender >= 10_000) {
      this._lastRender = now;
      this._render();
    } else if (!this._renderTimer) {
      const delay = 10_000 - (now - this._lastRender);
      this._renderTimer = setTimeout(() => {
        this._renderTimer = null;
        this._lastRender = Date.now();
        this._render();
      }, delay);
    }
  }

  protected _setBody(body: string, rowSelector?: string): void {
    const constrained = !!this._config?.grid_options?.rows;
    const cls = constrained ? ' class="grid-rows"' : "";
    this.shadowRoot!.innerHTML = `<style>${STYLES}${this._additionalStyles()}</style><ha-card${cls}>${body}</ha-card>`;
    if (constrained && rowSelector) this._scheduleTrim(rowSelector);
  }

  protected _scheduleTrim(rowSelector: string): void {
    if (this._trimTimer !== null) cancelAnimationFrame(this._trimTimer);
    this.style.opacity = "0";
    this._trimTimer = requestAnimationFrame(() => {
      this._trimTimer = null;
      const card = this.shadowRoot!.querySelector("ha-card") as HTMLElement | null;
      const h = card?.clientHeight ?? 0;
      if (card && h) {
        for (const el of Array.from(card.querySelectorAll<HTMLElement>(rowSelector))) {
          el.style.visibility = el.offsetTop + el.offsetHeight > h ? "hidden" : "";
        }
      }
      this.style.opacity = "";
    });
  }
}