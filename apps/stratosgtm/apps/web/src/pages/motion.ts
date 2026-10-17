import { useEffect } from 'react';
import { gsap } from 'gsap';

export function isBelowFold(top: number, viewportHeight: number): boolean {
  return top >= viewportHeight;
}

export function useRevealMotion(rootRef: React.RefObject<HTMLElement>): void {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!rootRef.current) return;
    if (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }
    if (typeof IntersectionObserver === 'undefined') return;

    let observer: IntersectionObserver | undefined;

    const ctx = gsap.context(() => {
      const elements = Array.from(rootRef.current!.querySelectorAll<HTMLElement>('[data-reveal]'));
      const belowFold = elements.filter((el) => isBelowFold(el.getBoundingClientRect().top, window.innerHeight));

      if (belowFold.length === 0) return;

      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            const el = entry.target as HTMLElement;
            observer!.unobserve(el);
            const isCard = el.dataset.reveal === 'card';
            gsap.to(el, {
              opacity: 1,
              y: 0,
              scale: 1,
              duration: 0.4,
              ease: isCard ? 'back.out(1.4)' : 'power2.out',
              clearProps: 'transform,opacity'
            });
          }
        },
        { rootMargin: '0px 0px -10% 0px' }
      );

      for (const el of belowFold) {
        const isCard = el.dataset.reveal === 'card';
        gsap.set(el, { opacity: 0, y: 16, ...(isCard ? { scale: 0.98 } : {}) });
        observer.observe(el);
      }
    }, rootRef.current);

    return () => {
      observer?.disconnect();
      ctx.revert();
    };
  }, [rootRef]);
}
