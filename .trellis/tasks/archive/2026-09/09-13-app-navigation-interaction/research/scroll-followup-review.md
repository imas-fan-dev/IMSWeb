# Scroll restoration follow-up review

## Finding

### Space activation cancels before a navigation button can save the desired position

`beginAppScrollRestoration` treats Space as a scroll key and cancels synchronously without checking the event target (`apps/web/app/lib/app-shell-scroll.ts:17`, `:107`). The App top bar uses a real button whose click calls `goBack` (`apps/web/app/components/app/app-top-bar.tsx:43`).

A failure is possible while a nonzero restoration is active:

1. The browser moves `scrollY` from the desired value because of late anchoring, and the helper queues its correction frame.
2. Keyboard focus is on the top-bar Back button and the user presses Space.
3. The window `keydown` listener finishes the restoration before the button emits its click.
4. `goBack` then calls `rememberCurrentLocation`. Because `restorationRef` has already been cleared, the provider saves the temporary `window.scrollY` instead of the desired restoration value (`apps/web/app/components/app/app-navigation-provider.tsx:113`).

The click-order regression at `apps/web/tests/unit/lib/app-shell-scroll.test.ts:150` covers pointer activation. The keyboard cases at `:100` and `:134` cover PageDown and Tab, not Space activation on a button.

Minimal correction: when Space originates from a native button, keep the restoration alive until the synthesized click. The existing captured click can suspend writes before the handler and cancel the old restoration afterward. Add a regression that introduces anchoring drift, sends a bubbling Space `keydown` to a button, and verifies that the old restoration is still available in the click handler and that its deferred cancellation does not cancel the replacement.

I found no other defect in the proposed timing. Nonzero restoration remains active until the five-second bound, resize and scroll events correct later growth or anchoring, zero finishes on its first scheduled application, and the old click timer is removed when the provider cancels the old restoration before creating the next one.

## Native QA reaction signal

There is no standalone reaction-loaded attribute. Each `NamecardReactionBar` mounts with an empty reaction object, renders `aria-label="名片反应"` immediately, and swallows read failures (`apps/web/app/pages/community/community-cards-page.tsx:124`). The section-level `aria-busy` at `:515` covers the card-page request only. Neither marker proves that reaction reads have settled.

For the existing return-position QA, capture a per-card signature before leaving the fully rendered page. For every `[data-namecard-item]`, collect and sort the `aria-label` values from:

```css
[aria-label="名片反应"] button[aria-label$="次反应"]
```

After returning, poll until the complete array of per-card signatures equals the saved array, then require `document.documentElement.scrollHeight` to equal the saved source height before asserting `scrollY`. These count-button labels are added only after `setReactions` receives the response, so the comparison waits for every reaction row that can change layout. A card with no reactions has an empty signature and adds no late reaction content.

If QA must distinguish a completed empty response from a pending or failed response, the current DOM cannot do that. That stricter check would need a product-owned loaded marker such as row-level `aria-busy`, or request observation in the QA harness.

## Verification

Static review only. I did not run builds or tests, as requested. Product sources and tests were not modified.
