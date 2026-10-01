/**
 * The host API this plugin is written against — declared here, published nowhere.
 *
 * `@nakama/ui` and `@nakama/core` live in the Nakama monorepo, which injects them into a plugin's
 * `node_modules` as symlinks to its own workspace packages. This repository is deliberately standalone
 * (`harness/install-plugin.mjs` copies it into that checkout on demand), so those packages are **not
 * resolvable here** — which is why `src/ui.tsx` and `src/actions.ts` could not be typechecked at all until
 * this file existed, and why the entire host-control surface silently degraded to `any`.
 *
 * ## What this is
 *
 * **A compatibility shim, not the authoritative host API definition.** `bun run typecheck:host` is the
 * authority whenever a real Nakama checkout is available. If the two ever disagree, this file is wrong: fix
 * the shim from the host's sources — never bend plugin code to satisfy a stale local declaration, because
 * that would convert a real incompatibility into a passing check.
 *
 * **Acceptance condition for changes to this file:** any commit that modifies `types/host.d.ts` must run
 * `bun run typecheck:host` against the supported checkout before merge, and say in the commit message which
 * host revision it was checked against.
 *
 * The slice of the host API *this plugin actually uses*, derived from the host's own sources
 * (`packages/ui/src/*.tsx`, `packages/core/src/plugins.ts`) rather than invented. Where the host's props are
 * plain React/DOM shapes they are reproduced exactly, by reference to the same helper the host uses
 * (`React.ComponentProps<...>`). Where the host builds on `@base-ui/react` — whose types this repository also
 * cannot resolve — the props are declared structurally, from the prop names and value shapes the plugin
 * passes.
 *
 * ## What this is not
 *
 * The host's full API, and not an authority on it. `@nakama/ui` exports a few dozen components; thirteen are
 * here because thirteen are used. If the host renames a prop, nothing in this file notices.
 *
 * ## How drift is caught
 *
 * `harness/typecheck-host.sh` runs the same check against the **real** host types where they exist (inside a
 * checkout, where the symlinks resolve). That run is authoritative. If it and `bun run typecheck` disagree,
 * this file is wrong — re-derive it from the host source. Do not widen it to make a disagreement go away;
 * that would turn a real incompatibility into a passing check.
 */

declare module "@nakama/core" {
  export type PluginActorRole = "admin" | "member" | "viewer";

  export interface PluginExecutionActor {
    id: string;
    role: PluginActorRole;
  }

  /** `packages/core/src/plugins.ts`. The plugin narrows this with its own fields. */
  export interface PluginExecutionContext {
    actionKey?: string;
    actor: PluginExecutionActor;
    apiVersion: 1;
    databasePath?: string;
    dataDir: string;
    invocationId: string;
    orgId: string;
    pluginId: string;
    pluginVersion: string;
    profileId?: string;
    sessionId?: string;
    workspaceRoot?: string;
  }
}

declare module "@nakama/ui" {
  export type ButtonVariant =
    | "default"
    | "destructive"
    | "ghost"
    | "link"
    | "outline"
    | "secondary";

  export type ButtonSize =
    | "default"
    | "icon"
    | "icon-lg"
    | "icon-sm"
    | "icon-xs"
    | "lg"
    | "sm"
    | "xs";

  /** `@base-ui/react/button` props plus the host's variants. */
  export const Button: import("react").ComponentType<
    import("react").ComponentProps<"button"> & {
      variant?: ButtonVariant;
      size?: ButtonSize;
    }
  >;

  /* The card family and the form fields are the host's thin wrappers over the DOM elements named here. */
  export const Card: import("react").ComponentType<
    import("react").ComponentProps<"div">
  >;
  export const CardHeader: import("react").ComponentType<
    import("react").ComponentProps<"div">
  >;
  export const CardTitle: import("react").ComponentType<
    import("react").ComponentProps<"h3">
  >;
  export const CardContent: import("react").ComponentType<
    import("react").ComponentProps<"div">
  >;
  export const Input: import("react").ComponentType<
    import("react").ComponentProps<"input">
  >;
  export const Textarea: import("react").ComponentType<
    import("react").ComponentProps<"textarea">
  >;

  /** The host declares these props explicitly; this is that declaration, not an approximation. */
  export const Switch: import("react").ComponentType<{
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
    disabled?: boolean;
    id?: string;
    className?: string;
    size?: "default" | "sm";
    "aria-label"?: string;
  }>;

  /*
   * The select family is `@base-ui/react/select` re-exported. The plugin passes these props and no others;
   * `onValueChange` takes `string | null` because that is what the plugin's own guard checks for.
   */
  export const Select: import("react").ComponentType<{
    value?: string;
    onValueChange?: (value: string | null) => void;
    disabled?: boolean;
    children?: import("react").ReactNode;
  }>;
  export const SelectTrigger: import("react").ComponentType<{
    className?: string;
    children?: import("react").ReactNode;
    size?: "sm" | "default";
    "aria-label"?: string;
  }>;
  export const SelectValue: import("react").ComponentType<{
    className?: string;
    children?: import("react").ReactNode;
    placeholder?: import("react").ReactNode;
  }>;
  export const SelectContent: import("react").ComponentType<{
    className?: string;
    children?: import("react").ReactNode;
    side?: "top" | "bottom" | "left" | "right";
    sideOffset?: number;
  }>;
  export const SelectItem: import("react").ComponentType<{
    value: string;
    className?: string;
    children?: import("react").ReactNode;
  }>;
}
