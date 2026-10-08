# Kinship Frontend V1 Blueprint

## Product Intent

Kinship is a trust-first relationship intelligence workspace for people who need to understand who to contact, why the relationship matters, which evidence supports that judgment, and whether outreach is appropriate. The primary journey is:

1. Add approved context.
2. Discover and select a person.
3. Review evidence and a relationship brief.
4. Create human-reviewed outreach.
5. Confirm consent, suppression, and provenance.

The interface should feel calm, credible, focused, and humane. Trust and evidence receive more visual weight than automation. Configuration and operational detail remain available through progressive disclosure.

## Executive UX Audit

### Previous Experience

- Every workflow appeared as an equal-weight card, increasing cognitive load and weakening the primary journey.
- Authentication, settings, onboarding, search, drafting, compliance, and audit competed on one page.
- The card grid required repeated scanning instead of supporting a person-first decision sequence.
- Text-heavy utility buttons slowed recognition and produced inconsistent control density.
- Responsive behavior stacked panels but did not establish a mobile navigation model.
- The visual palette was warm but overly beige/green and lacked a distinctive product identity.
- Feedback, empty states, and trust status existed but were visually disconnected from the action they affected.
- The 1,500-line client component mixed domain actions, demo fixtures, local state, and presentation.

### Redesign Principles

- **Progressive disclosure:** API setup and run preferences moved into Settings.
- **Gestalt proximity:** person, evidence, brief, draft, and trust decision are grouped by decision stage.
- **Hick's Law:** three primary destinations replace six equal navigation anchors.
- **Recognition over recall:** familiar Lucide icons, explicit status labels, and persistent score context.
- **Fitts's Law:** primary actions use stable 36px controls; mobile navigation remains fixed and reachable.
- **Error prevention:** compliance status remains adjacent to the draft and destructive suppression actions use danger styling.
- **Visibility of system status:** progress, save state, evidence confidence, ingestion health, and API feedback are visible at their point of use.

## Priorities

### High Impact - Implemented

- Person-first three-pane workspace.
- Separate Discover and Trust Center views.
- Settings drawer for API connection and run preferences.
- Independent prospect filtering and discovery query state.
- Command palette and `/` prospect-search shortcut.
- Responsive bottom navigation and mobile-safe toasts.
- Semantic light/dark themes and WCAG-oriented focus states.
- Evidence-linked draft claims and adjacent compliance decision.

### Medium Term

- Extract view components and domain hooks from `page.tsx`.
- Persist theme, view, draft, and workspace preferences.
- Add focus trapping and focus restoration to dialogs.
- Add component-level interaction tests with a browser runner.
- Add virtualized prospect/evidence lists for large workspaces.

### Long Term

- Saved views and workspace-level navigation state.
- Activity notifications with read state.
- Collaboration presence and comments.
- Analytics views with accessible tabular alternatives.

## Brand Identity

The working product identity is **Kinship**. The name emphasizes durable professional relationships rather than lead extraction. The visual language combines institutional navy, measured teal, and a restrained coral signal.

### Color Tokens

| Role         | Light     | Dark      | Rationale                                         |
| ------------ | --------- | --------- | ------------------------------------------------- |
| Canvas       | `#F5F7F9` | `#0E1722` | Quiet neutral workspace with low visual fatigue   |
| Surface      | `#FFFFFF` | `#151F2D` | Clear content plane and dependable hierarchy      |
| Text         | `#172033` | `#EDF2F5` | High contrast without pure-black harshness        |
| Primary navy | `#17324D` | `#DCE9EF` | Trust, seriousness, and stable primary actions    |
| Teal         | `#2A7B78` | `#66B8B3` | Intelligence, evidence, and constructive progress |
| Coral        | `#DD674B` | `#F08A70` | Human warmth and selective emphasis               |
| Success      | `#2D7A54` | `#6BC695` | Confirmed and allowed states                      |
| Warning      | `#A96F20` | `#E0AD5F` | Review-required states without alarmism           |
| Danger       | `#B94747` | `#EF8383` | Suppression, blocking, and destructive actions    |
| Info         | `#426B91` | `#80ADD3` | Neutral operational feedback                      |
| Border       | `#DDE3E8` | `#2A3949` | Structural separation with low visual noise       |

Color is never the sole status signal; all semantic states include text and/or icons.

## Design System

### Typography

- UI font: system sans stack with Inter preference.
- Page title: 24px / 1.2 / 700.
- Profile title: 20px / 1.2 / 700.
- Section title: 15px / 1.25 / 650-700.
- Body: 13-14px / 1.5-1.65.
- Metadata: 10-11px / 1.35.
- Letter spacing remains `0`; uppercase labels use only modest `0.08em` tracking.

### Spacing and Shape

- 8pt grid with 4px half-step for compact controls.
- Core spacing: 8, 12, 16, 20, 24, 32, 40px.
- Radius: 4px small, 6px controls, 8px surfaces.
- Minimum standard control height: 36px.
- Shadows are reserved for transient overlays and top-level elevation.

### Motion

- Control transitions: 140ms ease.
- Drawers and command menu: 180ms ease-out.
- Progress changes: 300ms ease.
- `prefers-reduced-motion` reduces all motion to effectively instant transitions.

### Breakpoints

- `>1380px`: full three-pane workspace.
- `1180-1380px`: compact three-pane workspace.
- `900-1180px`: prospect + brief with composer below.
- `<900px`: sidebar becomes bottom navigation.
- `<700px`: single-column workflow and in-flow notifications.

## Major Screen Wireframes

### Workspace

```text
[Sidebar] [Topbar: workspace | command | theme | add context]
          [Greeting                         Workflow progress]
          [Next best action                                  ]
          [Prospects] [Person + brief + evidence] [Draft + trust]
```

### Discover

```text
[Page heading]
[Source intake form] [Evidence search, filters, and people results]
```

### Trust Center

```text
[Policy heading + recheck]
[Current decision + channel controls] [Suppression ledger]
[Current decision + channel controls] [Ingestion status]
[Recent audit activity across full width]
```

### Settings

```text
[Right-side modal drawer]
[API connection]
[Workspace registration/login]
[Run preferences]
```

## Component Inventory

- App shell and responsive navigation.
- Workspace switcher and command trigger.
- Prospect search, filter, sort, and row.
- Profile header and relationship score bar.
- Brief summary and strongest-angle callout.
- Evidence row with source, freshness, reasons, and confidence.
- Notes composer and timeline.
- Draft variant tabs, composer, save/copy/generate actions.
- Trust decision callout and evidence claims.
- Source intake and discovery results.
- Suppression, job status, and audit lists.
- Settings drawer, command menu, status toast, empty state, and semantic badges.

## Frontend Architecture

### Current Foundation

- Next.js App Router client workspace.
- Domain computation remains in `dashboard-model.ts` and is covered by unit tests.
- API actions and demo data remain behaviorally compatible with the previous implementation.
- Lucide provides a consistent, tree-shakeable icon system.
- CSS custom properties provide theme and semantic tokens without runtime styling cost.

### Recommended Extraction

```text
apps/web/
  app/
    page.tsx                 # composition and data orchestration
    globals.css              # token entrypoint and global reset
  components/
    shell/
    workspace/
    discover/
    trust/
    overlays/
    ui/
  hooks/
    use-command-menu.ts
    use-workspace-session.ts
  lib/
    api-client.ts
    demo-fixtures.ts
  styles/
    tokens.css
    components.css
```

Extraction should be behavioral, performed view-by-view with tests, and should not introduce a global state library until cross-route state requires it.

## Acceptance Criteria

- Primary relationship workflow is understandable without scanning unrelated setup panels.
- All existing API actions remain reachable.
- Desktop uses a stable three-pane decision layout.
- Mobile uses a fixed four-destination navigation model.
- No horizontal overflow at tested desktop or 375px mobile widths.
- Dialogs expose semantic roles, labels, close controls, and Escape behavior.
- All icon-only controls have accessible names and tooltips.
- Focus indicators are visible against light and dark surfaces.
- Status is never communicated by color alone.
- Reduced-motion preference is honored.
- Tests, typecheck, lint, formatting, and production build pass.
- Browser console remains free of errors and warnings.

## Validation Record

- Dashboard model tests: 13/13 passing.
- TypeScript: passing.
- ESLint: passing.
- Prettier: passing.
- Next.js production build: passing.
- Runtime HTTP response: 200.
- Desktop horizontal overflow: none.
- Mobile horizontal overflow: none at 375px viewport.
- Workspace, Discover, Trust Center, Settings, dark mode, and command palette verified.
- Browser console errors/warnings: none.

## Tradeoffs

- The current implementation keeps orchestration and presentation together to preserve the working API workflow during the redesign. Physical component extraction is intentionally the next refactor, not bundled with the visual migration.
- The first release uses CSS transitions instead of an animation library, keeping bundle size and interaction cost low.
- Theme preference is session-local; persistence should be added with the broader preference model.
- The working brand name can be replaced through tokens and metadata without redesigning the interaction system.
