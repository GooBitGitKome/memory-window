# ADR 0003: 生成画像の室内と人物を分離する

Status: Accepted for the local demo (2026-10-11). Production art and animation require developer review.

## Context

The SVG character's component transformations produced visibly broken poses. The requested visual direction is a generated monochrome room and a separately generated character based on one consistent reference. Weather and time still need to change without regenerating the room.

## Decision

Use one generated raster room image and transparent, full-pose character PNGs. Keep the existing domain state machine and map each state to a complete character pose in the presentation layer. The weather layer remains independent so a location change can update the window without modifying the image. Animation is limited to a slight whole-figure motion and a brief pose fade; reduced-motion disables both.

Do not integrate Live2D Cubism in this demo. Its editor imports layered PSD artwork, then defines parameters and exports a Cubism model for the Web SDK. Our generated flat PNGs do not provide those separate editable parts or a rig. Adding the SDK alone would not fix the pose problem. A later milestone may commission/create a layered PSD, rig the model in Cubism Editor, verify the exported model and Web runtime, and review the applicable publication license before replacing the pose renderer.

## Consequences

The room and character can be changed independently, and the SVG limb distortions disappear. Motion between poses is a restrained image switch, not continuous skeletal or mesh animation. The character and weather assets are sizeable and may need carefully reviewed format optimization for slower devices. Character scale, alignment and art direction still require review on target tablets. No additional runtime dependency or external request is introduced by this decision.

## Visual revision (2026-10-11)

The same room asset remains in use. The character was redrawn at about three heads tall with fewer interior lines. The original realistic character PNGs were replaced by nine consistent transparent poses. The weather now uses generated monochrome landscape variants with the same tree and horizon. A small geometric SVG mask makes only the two glass panes of the room asset transparent, so the weather image is the rear layer and the original mullion, sill and curtains stay in front. The SVG is only a cut-out mask; the illustration is raster art. No additional runtime dependency or external service was added.

Official references: [PSD import](https://docs.live2d.com/en/cubism-editor-manual/psd-import/), [model files for Web SDK](https://docs.live2d.com/en/cubism-sdk-manual/model-web/), [SDK publication license](https://www.live2d.com/en/sdk/license/).

## Conversation framing and animation tooling review (2026-10-11)

Conversation focus uses the existing whole-pose PNG and CSS movement/scale; it introduces no renderer dependency. The walking pose has a small vertical rhythm, but its legs do not articulate. The local clock is presentation-only and sends or stores no time data.

The currently connected agent tools provide image generation and code editing, but no Live2D model-authoring/rigging MCP. Plugin discovery returned image-to-video tools, not a confirmed interactive character-rigging integration. Those video tools could make a fixed clip, but a conversation character needs state-controlled idle/listening/speaking motion, accessible reduced-motion behavior, and a Web runtime. Therefore no new plugin or runtime was added.

For a later rigged-character prototype: obtain approved layered PSD source art (separate face, eyes, mouth, hair, torso and limbs), model and animate it in Cubism Editor, export a Web model, then test the official Cubism SDK for Web on target tablets. Compare quality, build size, performance and publication terms before adoption. The current flat PNGs can guide the art direction but cannot become a fully articulated model merely by installing the SDK. Live2D's publication terms specifically address AI/chatbot interfaces; the developer must review the applicable license before release. Sources: [PSD import](https://docs.live2d.com/en/cubism-editor-manual/psd-import/), [Cubism SDK for Web](https://docs.live2d.com/en/cubism-sdk-manual/cubism-sdk-for-web/), [SDK release license](https://www.live2d.com/en/sdk/license/).

Rive is a second prototype candidate because its editor supports raster meshes/bones and state machines with interactive Web runtimes. It still needs prepared artwork and an authored rig; it is not an MCP that automatically converts the existing PNG into expressive animation. Compare a small idle/listening/speaking prototype with Cubism before choosing a production renderer. Sources: [Rive mesh/bones and PSD](https://rive.app/blog/new-features-released-mesh-deformation-and-psd-support), [Rive Editor and state machines](https://rive.app/editor).

## Frame-animation prototype (2026-10-11)

Three new transparent frames extend the existing poses: opposite walking stride, closed eyes, and closed mouth. The walking frames alternate as complete figures. Eyes and mouth are clipped to their facial regions and overlaid on the original figure so slight differences in generated clothing or outline do not flicker. Timers exist only in the presentation component, are cleared when states change, and are disabled by reduced-motion preference. No SDK, network request, or personal-data flow was added. The PWA precache increased from about 21.8 MiB to 25.0 MiB; optimize assets before slower-network deployment. Mouth movement follows the SPEAKING state, not audio amplitude. Review the visual rhythm and alignment on a target tablet before treating this as final animation.
