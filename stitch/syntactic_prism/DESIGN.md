# Design System Document: The Intellectual Architect

This design system is crafted for a premium, AI-powered proofreading engine. It moves beyond the utility of a standard "tool" to become a "Digital Curator"—an authoritative yet breathable environment that treats text with the same reverence as a gallery treats art. 

## 1. Creative North Star: The Digital Curator
The "Digital Curator" philosophy rejects the cluttered, utility-first density of legacy word processors. Instead, it embraces **Sophisticated Editorialism**. We achieve this through:
*   **Intentional Asymmetry:** Breaking the 12-column grid with generous, "unbalanced" white space to draw the eye to critical AI insights.
*   **Tonal Authority:** Using deep indigos and slates to create a focused, "dark-mode-adjacent" workspace that reduces eye strain during long-form editing.
*   **The "Living Document" Feel:** Using glassmorphism and soft gradients to make the interface feel like it is reacting and breathing alongside the user’s thoughts.

---

## 2. Color & Surface Architecture
This system relies on depth and tonal shifts rather than lines. We treat the UI as a series of stacked, premium materials.

### Color Palette Strategy
*   **Primary (Indigo):** `#3a388b` (Primary) and `#5250a4` (Primary Container). Used for the core "Intelligence" of the UI—AI suggestions and active states.
*   **Secondary (Slate):** `#515f74`. This grounds the experience, providing a professional, neutral counterweight to the vibrant Indigo.
*   **Tertiary (Emerald Accent):** `#004e33` (Tertiary) to `#4edea3` (Fixed Dim). This is our "Precision" color, used exclusively for high-value CTAs and "Final Approval" actions.

### The "No-Line" Rule
**Explicit Instruction:** Do not use 1px solid borders for sectioning or containment. 
*   Boundaries must be defined solely through background color shifts. 
*   *Example:* A text editor (using `surface-container-lowest`) should sit directly against a navigation sidebar (using `surface-container-low`) without a divider.

### Surface Hierarchy & Nesting
Treat the UI as physical layers of fine paper. 
1.  **Base:** `surface` (`#faf8ff`) - The desk.
2.  **Sectioning:** `surface-container-low` (`#f2f3ff`) - Large layout blocks.
3.  **Focus Elements:** `surface-container-highest` (`#dae2fd`) - Used for the "active" proofreading card to make it pop against the background.

### Signature Textures
Avoid flat colors for hero elements. Use a linear gradient from `primary` (`#3a388b`) to `primary_container` (`#5250a4`) at a 135-degree angle for main Action Buttons or AI Progress bars to provide a "lit-from-within" professional polish.

---

## 3. Typography: Editorial Precision
We pair **Manrope** (Display/Headline) for a modern, geometric character with **Inter** (Body/UI) for world-class legibility.

*   **The Power of Scale:** Use `display-lg` (3.5rem) for empty states or dashboard greetings to create a bold, editorial impact.
*   **Contextual Labels:** `label-md` and `label-sm` should always use `on_surface_variant` (`#454652`) with a slight letter-spacing increase (0.05rem) to ensure they feel like professional annotations rather than just "small text."
*   **The Proofreader’s Body:** Use `body-lg` (1rem) for the main text editor content to ensure a comfortable reading rhythm, utilizing a line height of 1.6 for maximum clarity.

---

## 4. Elevation & Depth
Depth in this system is organic, not artificial.

*   **Tonal Layering:** Instead of a shadow, place a `surface-container-lowest` card on a `surface-container` background. The shift from `#ffffff` to `#eaedff` creates a "Ghost Lift" that feels high-end and clean.
*   **Ambient Shadows:** For floating elements (Modals, Pop-overs), use a custom shadow:
    *   `box-shadow: 0 24px 48px -12px rgba(19, 27, 46, 0.08);`
    *   The shadow must be tinted with the `on_surface` color (`#131b2e`) to mimic natural light.
*   **Glassmorphism:** For AI suggestion "bubbles," use the `surface_container_low` token with 80% opacity and a `backdrop-blur: 12px`. This creates a "Frosted Glass" effect that allows the underlying document text to subtly bleed through.
*   **The Ghost Border Fallback:** If accessibility requires a border, use `outline_variant` (`#c5c5d4`) at **15% opacity**.

---

## 5. Components

### The "Signature" Editor Card
*   **Background:** `surface_container_lowest`.
*   **Corner Radius:** `xl` (0.75rem).
*   **Interaction:** On hover, shift the background to `surface_bright` and apply a `sm` shadow.

### Buttons (The Precision Drivers)
*   **Primary:** Gradient of `primary` to `primary_container`. Text: `on_primary`. Radius: `md` (0.375rem).
*   **Tertiary (The "Accept" Action):** `tertiary_fixed` (`#6ffbbe`). Provides a high-contrast "vibrant" moment against the deep indigo UI.
*   **States:** Transitions should be `200ms ease-out`. Avoid "bounce" animations; use "smooth fade" to maintain an aura of professional stability.

### Input Fields
*   **Unfocused:** No border. Background: `surface_container_low`.
*   **Focused:** `outline` (`#757684`) Ghost Border (20% opacity) and a 2px bottom-accent of `primary`.
*   **Error:** Use `error` (`#ba1a1a`) only for the text and a subtle `error_container` glow.

### AI Insight Chips
*   **Style:** `surface_variant` background, no border, `sm` (0.125rem) radius.
*   **Typography:** `label-md` (Inter).

---

## 6. Do’s and Don’ts

### Do:
*   **Use White Space as a Separator:** Use the `spacing.16` (4rem) to separate major sections.
*   **Layer Surfaces:** Place "Highest" containers inside "Low" containers to guide the user's focus.
*   **Respect the Type Scale:** Maintain a strict hierarchy between Manrope and Inter to preserve the "Editorial" feel.

### Don't:
*   **Don't use 100% Black:** Always use `on_surface` (`#131b2e`) for text to maintain the premium indigo-slate depth.
*   **Don't use Dividers:** Never use a horizontal rule (`<hr>`) to separate list items. Use a `spacing.4` gap or a subtle background shift.
*   **Don't Over-Round:** Stick to `md` and `xl` for structural elements. Avoid `full` (pill shapes) except for small status chips to maintain a professional, architectural aesthetic.