# Match Day · Cricket

A reusable sports skin, starting with cricket. The three settings are Stadium Lights (modern evening hospitality), Pavilion Club (traditional golden-hour terrace) and Players’ Entrance (night-time stadium tunnel).

Palette: stadium navy `#091e29`, pitch green `#186246`, warm ivory `#f4ebd8`, championship gold `#d8b56d`. Bold sans-serif Match Day heading; restrained supporting copy and large touch controls. No licensed team/league branding.

Landscape and portrait photo frames use a thin gold keyline, transparent photo opening and navy footer. Small wicket/ball motifs sit in the corner; the photograph retains most of the postcard area. UI and frame source are in `scripts/design-cricket-package.cjs`; photographic provenance and exact prompts are in `deliverables/skin-packages/cricket-artwork-prompts.json`.

The ZIP is the distributable. The `sports-cricket` folder contains editable source assets. Additional sports can use new package IDs and the same versioned manifest/asset structure without a core app build change when they use existing booth features.

## Cricket 1.1.0 — broadcast revision

Three deliberately different settings: **Broadcast Arena** (navy/cyan/emerald stadium graphics), **Cricket Analysis Studio** (tactical screen, timber and red-ball details), and **Champions Gallery** (warm stone, brass, bats and trophy cabinets).

Each includes separately generated **wide, medium and close** plates: nine total. The existing Halloween selector remains unchanged (largest apparent face determines depth), and guest crop/scale logic is unchanged. The package includes matching SHA-256 depth metadata. Classic photo has a black-backdrop family preview and retains normal original-camera capture.

The prior 1.0.0 ZIP is retained. Deploy/publish `sports-cricket-1.1.0.booth.zip`; it runs on the same 1.3.0 booth app. See the nine-panel contact sheet and prompt/provenance manifest under `deliverables/skin-packages`.
