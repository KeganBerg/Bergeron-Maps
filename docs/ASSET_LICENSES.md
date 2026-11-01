# Asset licenses

All 32 map symbols and patterns in `src/assets/library.ts` were drawn specifically for Bergeron Maps as simple SVG markup in this repository. They contain no third-party icons, fonts embedded as outlines, logos or traced artwork, so no external license or attribution applies. They are owned with the rest of this codebase and can be used commercially and in white-labeled deployments.

UI icons in `src/ui/icons.tsx` are also original path data written for this project.

Third-party code libraries are used under their own open-source licenses:

| Library | License |
|---|---|
| react, react-dom | MIT |
| konva, react-konva | MIT |
| zustand | MIT |
| immer | MIT |
| nanoid | MIT |

**Rule for future assets:** before adding any external icon, image, font or map imagery, record its source, license, and whether commercial multi-tenant use and redistribution are allowed in this file. Do not assume all assets from one provider share the same license. Map-provider imagery (Google, Apple, etc.) must not be added without following that provider's terms.

Background images uploaded by customers remain the customer's responsibility; the uploader reminds them to use images they have the right to use.
