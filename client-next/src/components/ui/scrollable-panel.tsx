"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface ScrollablePanelRef {
  scrollToBottom: (behavior?: ScrollBehavior) => void;
  scrollToTop: (behavior?: ScrollBehavior) => void;
  get isAtBottom(): boolean;
}

interface ScrollablePanelProps extends React.HTMLAttributes<HTMLDivElement> {
  autoScroll?: boolean;
  onUserScroll?: (isAtBottom: boolean) => void;
  stickToBottom?: boolean;
  children: React.ReactNode;
}

export const ScrollablePanel = React.forwardRef<ScrollablePanelRef, ScrollablePanelProps>(
  ({ autoScroll = false, onUserScroll, stickToBottom = true, className, children, ...props }, ref) => {
    const containerRef = React.useRef<HTMLDivElement>(null);
    const isUserScrolledRef = React.useRef(false);
    const prevScrollHeightRef = React.useRef(0);
    const isAutoScrollingRef = React.useRef(false);

    const getIsAtBottom = React.useCallback(() => {
      const el = containerRef.current;
      if (!el) return true;
      const threshold = 50;
      return el.scrollHeight - el.scrollTop - el.clientHeight <= threshold;
    }, []);

    const scrollToBottom = React.useCallback((behavior: ScrollBehavior = "auto") => {
      const el = containerRef.current;
      if (!el) return;
      isAutoScrollingRef.current = true;
      el.scrollTo({ top: el.scrollHeight, behavior });
      // Clear the flag after the scroll animation would complete
      window.setTimeout(() => {
        isAutoScrollingRef.current = false;
      }, behavior === "smooth" ? 300 : 0);
    }, []);

    const scrollToTop = React.useCallback((behavior: ScrollBehavior = "auto") => {
      const el = containerRef.current;
      if (!el) return;
      isAutoScrollingRef.current = true;
      el.scrollTo({ top: 0, behavior });
      window.setTimeout(() => {
        isAutoScrollingRef.current = false;
      }, behavior === "smooth" ? 300 : 0);
    }, []);

    React.useImperativeHandle(ref, () => ({
      scrollToBottom,
      scrollToTop,
      get isAtBottom() {
        return getIsAtBottom();
      },
    }));

    // Auto-scroll when children change
    React.useEffect(() => {
      if (!autoScroll) return;
      const el = containerRef.current;
      if (!el) return;

      // Only auto-scroll if user hasn't manually scrolled up (unless stickToBottom is forced)
      if (!stickToBottom && isUserScrolledRef.current && !getIsAtBottom()) {
        return;
      }

      // Use requestAnimationFrame to ensure DOM layout is complete
      const rafId = requestAnimationFrame(() => {
        // Double-check with setTimeout(0) to catch any lingering layout shifts
        window.setTimeout(() => {
          scrollToBottom("auto");
        }, 0);
      });

      return () => cancelAnimationFrame(rafId);
    }, [children, autoScroll, stickToBottom, scrollToBottom, getIsAtBottom]);

    // Track user scroll to detect when they've scrolled up manually
    const handleScroll = React.useCallback(() => {
      if (isAutoScrollingRef.current) return;
      const atBottom = getIsAtBottom();
      isUserScrolledRef.current = !atBottom;
      onUserScroll?.(atBottom);
    }, [getIsAtBottom, onUserScroll]);

    return (
      <div
        ref={containerRef}
        className={cn("overflow-y-auto", className)}
        onScroll={handleScroll}
        {...props}
      >
        {children}
      </div>
    );
  }
);

ScrollablePanel.displayName = "ScrollablePanel";
