"use client";

import { Component, createContext, createRef, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/use-language";
import { createPrivateDraftOwner, type PrivateDraftOwner, type PrivateDraftScope } from "@/lib/private-draft";
import { readCurrentAuthority } from "@/lib/auth-authority";
import { clearAuthSessionStorage } from "@/lib/auth-session";
import ForbiddenState from "./ForbiddenState";

const Context = createContext<{ owner: PrivateDraftOwner; scope: PrivateDraftScope; active: boolean } | null>(null);
const noOwnerSubscription = () => () => {};
const noOwner = () => false;
export function usePrivateDraftAccess() { return useContext(Context); }

type DraftRegionProps = {
  owner: PrivateDraftOwner;
  scope: PrivateDraftScope;
  active: boolean;
  recovery: RefObject<HTMLElement | null>;
  children: React.ReactNode;
};
type HeldFocus = {
  target: HTMLElement;
  selection: { start: number; end: number; direction: "forward" | "backward" | "none" | null } | null;
  cancelled: boolean;
  visitedRecovery: boolean;
  removingRecovery: boolean;
};

function visibleTarget(target: HTMLElement) {
  if (target.closest("[hidden], [inert], [aria-hidden='true']")) return false;
  for (let element: HTMLElement | null = target; element; element = element.parentElement) {
    const style = getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse"
      || style.contentVisibility === "hidden" || style.opacity === "0") return false;
  }
  return true;
}

class DraftRegion extends Component<DraftRegionProps, Record<string, never>, boolean> {
  private root = createRef<HTMLDivElement>();
  private heldFocus: HeldFocus | null = null;

  private cancelFocus = () => { if (this.heldFocus) this.heldFocus.cancelled = true; };
  private onVisibility = () => { if (document.visibilityState !== "visible") this.cancelFocus(); };
  private onPointerDown = (event: PointerEvent) => {
    if (event.target instanceof Node && !this.props.recovery.current?.contains(event.target)) this.cancelFocus();
  };
  private onFocusIn = (event: FocusEvent) => {
    const held = this.heldFocus;
    if (!held || !(event.target instanceof Node)) return;
    if (this.props.recovery.current?.contains(event.target)) held.visitedRecovery = true;
    else if (event.target !== document.body || (held.visitedRecovery && !held.removingRecovery)) this.cancelFocus();
  };

  componentDidMount() {
    document.addEventListener("focusin", this.onFocusIn, true);
    document.addEventListener("pointerdown", this.onPointerDown, true);
    document.addEventListener("visibilitychange", this.onVisibility);
    window.addEventListener("blur", this.cancelFocus);
  }

  getSnapshotBeforeUpdate(previous: Readonly<DraftRegionProps>) {
    if (previous.owner !== this.props.owner) this.heldFocus = null;
    // Unlike a layout effect, this runs before hidden/inert can release native focus.
    if (previous.active && !this.props.active) {
      const target = document.activeElement;
      const root = this.root.current;
      this.heldFocus = null;
      if (document.hasFocus() && document.visibilityState === "visible" && this.props.scope.alive()
        && root && target instanceof HTMLElement && target !== root && root.contains(target)
        && target.closest("[data-private-draft-owner]") === root
        && !target.closest('[role="dialog"], [role="alertdialog"]')) {
        const text = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement ? target : null;
        const start = text?.selectionStart ?? null;
        const end = text?.selectionEnd ?? null;
        this.heldFocus = {
          target, selection: text && start !== null && end !== null ? { start, end, direction: text.selectionDirection } : null,
          cancelled: false, visitedRecovery: false, removingRecovery: false,
        };
      }
    }
    const recoveryOwned = !previous.active && this.props.active
      && Boolean(this.props.recovery.current?.contains(document.activeElement));
    if (this.heldFocus) this.heldFocus.removingRecovery = recoveryOwned;
    return recoveryOwned;
  }

  componentDidUpdate(previous: Readonly<DraftRegionProps>, _state: Readonly<Record<string, never>>, recoveryOwned: boolean) {
    if (previous.active || !this.props.active) return;
    const held = this.heldFocus;
    this.heldFocus = null;
    const root = this.root.current;
    if (!held || held.cancelled || !recoveryOwned || !root || !this.props.scope.ready()
      || !document.hasFocus() || document.visibilityState !== "visible") return;
    const active = document.activeElement;
    if (active !== document.body && !this.props.recovery.current?.contains(active)) return;
    const target = held.target;
    if (!target.isConnected || !root.contains(target) || target.closest("[data-private-draft-owner]") !== root
      || target.matches(":disabled, [aria-disabled='true']") || !visibleTarget(target)
      || [...document.querySelectorAll<HTMLElement>('[role="dialog"], [role="alertdialog"]')].some(visibleTarget)) return;
    target.focus({ preventScroll: true });
    if (document.activeElement === target && held.selection
      && (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)
      && target.selectionStart !== null && target.selectionEnd !== null) {
      target.setSelectionRange(held.selection.start, held.selection.end, held.selection.direction ?? undefined);
    }
  }

  componentWillUnmount() {
    this.heldFocus = null;
    document.removeEventListener("focusin", this.onFocusIn, true);
    document.removeEventListener("pointerdown", this.onPointerDown, true);
    document.removeEventListener("visibilitychange", this.onVisibility);
    window.removeEventListener("blur", this.cancelFocus);
  }

  render() {
    const { active, owner, children } = this.props;
    return <div ref={this.root} hidden={!active} inert={!active} aria-hidden={!active || undefined} data-private-draft-owner={owner.key}>
      {children}
    </div>;
  }
}

function DraftLifetime({ owner, active, recovery, children }: {
  owner: PrivateDraftOwner; active: boolean; recovery: RefObject<HTMLElement | null>; children: React.ReactNode;
}) {
  const scope = useMemo(() => owner.createScope(), [owner]);
  const context = useMemo(() => ({ owner, scope, active }), [owner, scope, active]);
  useLayoutEffect(() => {
    owner.activate();
    scope.activate();
    return () => {
      scope.suspend();
      owner.suspend();
    };
  }, [owner, scope]);
  return <Context.Provider value={context}>
    <DraftRegion owner={owner} scope={scope} active={active} recovery={recovery}>
      {children}
    </DraftRegion>
  </Context.Provider>;
}

export function PrivateDraftConsumer({ permissions, recordKey, children }: {
  permissions: readonly string[]; recordKey: string; children: React.ReactNode;
}) {
  const context = usePrivateDraftAccess();
  if (!context) return children;
  return <ConsumerLifetime key={`${context.owner.key}:${recordKey}`} owner={context.owner}
    active={context.active} permissions={permissions}>{children}</ConsumerLifetime>;
}

function ConsumerLifetime({ owner, active, permissions, children }: {
  owner: PrivateDraftOwner; active: boolean; permissions: readonly string[]; children: React.ReactNode;
}) {
  const permissionKey = permissions.join("\0");
  const scope = useMemo(() => owner.createScope(permissionKey.split("\0")), [owner, permissionKey]);
  const context = useMemo(() => ({ owner, scope, active: active && scope.ready() }), [owner, scope, active]);
  useLayoutEffect(() => {
    scope.activate();
    return () => scope.suspend();
  }, [scope]);
  if (!scope.alive()) return null;
  return <Context.Provider value={context}>{children}</Context.Provider>;
}

export default function PrivateDraftBoundary({ permissions, children }: {
  permissions: readonly string[]; children: React.ReactNode;
}) {
  const auth = useAuth();
  const client = useQueryClient();
  const router = useRouter();
  const { lang } = useLanguage();
  const [owner, setOwner] = useState<PrivateDraftOwner | null>(null);
  // Cache removal can retire an owner without notifying its query observers.
  const ownerAlive = useSyncExternalStore(owner?.subscribe ?? noOwnerSubscription, owner?.alive ?? noOwner, noOwner);
  const retry = useRef<HTMLButtonElement>(null);
  const recovery = useRef<HTMLElement>(null);
  const redirected = useRef(false);
  const ended = owner?.ended() ?? false;
  const allowed = !ended && auth.isCurrent && permissions.some(auth.hasPermission);
  const identityChanged = owner && auth.principalId !== owner.principalId;
  const retain = owner && ownerAlive && !identityChanged
    && (allowed || (owner.principalId !== null && ["checking", "rechecking", "unavailable"].includes(auth.phase)));

  useEffect(() => {
    if (!allowed || (owner?.alive() && !identityChanged)) return;
    let cancelled = false;
    queueMicrotask(() => {
      const current = readCurrentAuthority(client);
      if (!cancelled && current.phase === "ready" && current.principalId === auth.principalId) {
        setOwner(createPrivateDraftOwner(client, auth.principalId, permissions, auth.hasPermission));
      }
    });
    return () => { cancelled = true; };
  }, [allowed, owner, identityChanged, client, auth.principalId, permissions, auth.hasPermission]);
  useLayoutEffect(() => {
    if (owner && auth.isCurrent) owner.updatePreview(auth.hasPermission);
  }, [owner, auth.isCurrent, auth.hasPermission]);
  useEffect(() => {
    if (auth.phase === "unauthenticated" && !redirected.current) {
      redirected.current = true;
      clearAuthSessionStorage();
      client.clear();
      router.replace("/login");
    }
  }, [auth.phase, client, router]);
  const holding = !allowed && auth.phase !== "unauthenticated";
  useLayoutEffect(() => {
    if (holding) {
      if (auth.phase === "unavailable") retry.current?.focus({ preventScroll: true });
      else recovery.current?.focus({ preventScroll: true });
    }
  }, [holding, auth.phase]);
  if (ended) return null;
  if (auth.phase === "ready" && !allowed) return <ForbiddenState description={lang === "am"
    ? "ይህን ይዘት ለማየት ፈቃድ የለዎትም።" : "You do not have the required permissions to view this content."} />;
  return <>
    {retain && <DraftLifetime key={owner.key} owner={owner} active={allowed} recovery={recovery}>{children}</DraftLifetime>}
    {(!retain || !allowed) && auth.phase !== "unauthenticated" && <section ref={recovery} tabIndex={-1}
      className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background p-6 text-foreground" aria-live="polite">
      <h1 className="text-lg font-bold">{lang === "am" ? "የመግቢያ ፈቃድን በማረጋገጥ ላይ" : "Verify your access"}</h1>
      <p role={auth.phase === "unavailable" ? "alert" : "status"} className="max-w-prose text-sm text-muted">
        {auth.phase === "unavailable"
          ? (lang === "am" ? "ፈቃድን ማረጋገጥ አልተቻለም። እንደገና ይሞክሩ።" : "Access could not be verified. Your private draft is hidden until verification succeeds.")
          : (lang === "am" ? "እባክዎ ይጠብቁ።" : "Checking current access…")}
      </p>
      <button ref={retry} type="button" disabled={auth.phase !== "unavailable"}
        onClick={() => { void auth.retryCurrent(); }}
        className="min-h-12 min-w-12 rounded-xl border border-border bg-card px-4 focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50">
        {lang === "am" ? "እንደገና ሞክር" : "Retry access"}
      </button>
    </section>}
  </>;
}
