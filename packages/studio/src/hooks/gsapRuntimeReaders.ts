/**
 * Low-level GSAP runtime property readers shared by gsapRuntimeBridge and gsapDragCommit.
 */
import type { GsapAnimation } from "@hyperframes/core/gsap-parser";

interface IframeGsap {
  getProperty: (el: Element, prop: string) => number;
}

export function readGsapProperty(
  iframe: HTMLIFrameElement | null,
  selector: string | null,
  prop: string,
): number | null {
  if (!iframe?.contentWindow || !selector) return null;
  try {
    const gsap = (iframe.contentWindow as unknown as { gsap?: IframeGsap }).gsap;
    if (!gsap?.getProperty) return null;
    const el = iframe.contentDocument?.querySelector(selector);
    if (!el) return null;
    const val = Number(gsap.getProperty(el, prop));
    return Number.isFinite(val) ? Math.round(val) : null;
  } catch {
    return null;
  }
}

const POSITION_PROPS = new Set(["x", "y", "xPercent", "yPercent"]);

export function readAllAnimatedProperties(
  iframe: HTMLIFrameElement | null,
  selector: string,
  anim: GsapAnimation,
): Record<string, number> {
  const result: Record<string, number> = {};
  if (!iframe?.contentWindow) return result;
  let gsap: IframeGsap | undefined;
  try {
    gsap = (iframe.contentWindow as unknown as { gsap?: IframeGsap }).gsap;
  } catch {
    return result;
  }
  if (!gsap?.getProperty) return result;
  let doc: Document | null = null;
  try {
    doc = iframe.contentDocument;
  } catch {
    return result;
  }
  const el = doc?.querySelector(selector);
  if (!el) return result;

  const propKeys = new Set<string>();
  if (anim.keyframes) {
    for (const kf of anim.keyframes.keyframes) {
      for (const p of Object.keys(kf.properties)) {
        if (typeof kf.properties[p] === "number") propKeys.add(p);
      }
    }
  } else {
    for (const p of Object.keys(anim.properties)) propKeys.add(p);
  }

  for (const prop of propKeys) {
    const val = Number(gsap.getProperty(el, prop));
    if (Number.isFinite(val)) {
      result[prop] = POSITION_PROPS.has(prop) ? Math.round(val) : Math.round(val * 1000) / 1000;
    }
  }

  const otherTweenProps = new Set<string>();
  try {
    const win = iframe.contentWindow as unknown as { __timelines?: Record<string, unknown> };
    const timelines = win.__timelines;
    if (timelines) {
      for (const tl of Object.values(timelines)) {
        const tlObj = tl as {
          getChildren?: (
            deep: boolean,
          ) => Array<{ targets?: () => Element[]; vars?: Record<string, unknown> }>;
        };
        if (!tlObj?.getChildren) continue;
        for (const child of tlObj.getChildren(true)) {
          if (typeof child.targets !== "function") continue;
          const targets = child.targets();
          if (!targets.includes(el)) continue;
          const vars = child.vars;
          if (!vars) continue;
          for (const k of Object.keys(vars)) {
            if (
              k !== "duration" &&
              k !== "ease" &&
              k !== "delay" &&
              k !== "stagger" &&
              k !== "id" &&
              k !== "onComplete" &&
              k !== "onUpdate"
            ) {
              otherTweenProps.add(k);
            }
          }
        }
      }
    }
  } catch {}
  for (const p of propKeys) otherTweenProps.delete(p);

  const VISUAL_BASELINE: Record<string, number> = {
    opacity: 1,
    scale: 1,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
  };
  for (const [prop, defaultVal] of Object.entries(VISUAL_BASELINE)) {
    if (prop in result) continue;
    if (otherTweenProps.has(prop)) continue;
    const val = Number(gsap.getProperty(el, prop));
    if (Number.isFinite(val) && Math.round(val * 1000) !== Math.round(defaultVal * 1000)) {
      result[prop] = Math.round(val * 1000) / 1000;
    }
  }

  return result;
}
