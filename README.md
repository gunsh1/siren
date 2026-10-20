# SIREN (PS2-look homage)

A third-person survival horror prototype in the shape of *SIREN*, rendered to
look like PS2 footage: a 512x448 framebuffer, 16-bit ordered dithering, vertex
lighting, heavy fog, and a composite-video pass on top.

Personal, non-commercial homage. No original assets are used.

```
npm install
npm run dev        # play it
npm run shot       # reference screenshots into tools/shots/
npm run check      # typecheck, unit tests, build, render + animation checks
```

## The PS2 look

Everything that defines it lives in [src/render/ps2/](src/render/ps2/):

| File | What it does |
|---|---|
| `params.ts` | Every tunable value, in one object |
| `material.ts` | Gouraud (per-vertex) lighting with exp2 fog |
| `composite.ts` | Chroma smear, interlace, RGB555 dither, grain, letterbox |
| `textures.ts` | 64-128px textures generated on a canvas |

Two deliberate decisions:

- **Colour management is off** ([src/boot.ts](src/boot.ts)). PS2 hardware shaded
  in gamma space, and this pipeline composites by hand, so there is nowhere for
  three.js to apply a linear->sRGB encode.
- **No vertex jitter or affine texture warping.** Those are PS1 artefacts. PS2
  had perspective correction and floating-point transforms; adding them makes it
  look like the wrong console.

Tune one value at a time and compare screenshots. `npm run check:render` guards
the things a screenshot will not catch - buffer size, colour count, and the
draw-call budget.

## Scope

The player walking around stage 1 is all that exists. Controls are WASD, Shift
to run, C to crouch, Z to go prone, mouse to look. There are no weapons, no
enemies and no damage, so there are no bindings or animation slots for them
either - those go in alongside the systems that use them.

## Animation database

Characters are not wired to named animation files. Instead every clip is
measured, and the game asks for what it needs - "walking, crouched, 1.0 m/s" -
and the resolver picks the closest clip and time-scales it so the feet do not
slide.

This exists because Mixamo names every exported clip `mixamo.com`. The filename
is the only text there is, and it never says how fast the character moves.

### Adding animations

```
npm run mixamo:login    # opens a browser; sign in once, session kept in .mixamo-profile/
npm run mixamo:fetch    # downloads every slot still missing, baked onto your character
npm run anim:index      # plays each clip, measures it, writes anim-index.json
npm run check:anim      # reports coverage and what is still missing
npm run anim:sheet      # one screenshot per clip, to actually look at them
```

Only what the game currently plays lives in `public/models/anim/`. Clips for
things that do not exist yet - combat, damage reactions, shibito - are parked in
`public/models/anim-later/`, which nothing scans. Move a file back and re-run
`anim:index` when the feature that needs it lands.

`mixamo:fetch` reads its shopping list from
[src/anim/requirements.ts](src/anim/requirements.ts), so the game's needs stay
the one source of truth. It exports against your own uploaded character when
you have one, which means the animation is baked onto your rig's proportions
and the hips curve needs no correction at all.

To add clips by hand instead: **FBX Binary**, **30 fps**, **no keyframe
reduction**, **Without Skin**, dropped in `public/models/anim/`. Characters go
in `public/models/actors/<name>/` and want **With Skin**.

Export **with** root motion (leave "In Place" unchecked). The indexer needs the
translation to measure real ground speed; the runtime strips it again, because
the controller owns where the character is.

### What gets measured

Per clip: ground speed, the speed an in-place clip *implies* from how fast the
planted foot slides under the hips, stride length, cadence, hip height (posture),
foot-contact alternation and regularity, pelvis yaw swing, how much the feet
travel sideways, airborne fraction, limb activity, and how cleanly the first and
last poses match.

Those last few matter more than they sound: alternating foot contacts alone do
not make a walk, because a dance has those too. Walking additionally keeps the
pelvis pointed where it is going and slides the planted foot straight back under
the body. That pair of numbers is what separates `Walking.fbx` (yaw swing 25°,
sideways 10%) from a dance (111°, 57%).

| Module | Role |
|---|---|
| [src/anim/analyze.ts](src/anim/analyze.ts) | Measurement and classification |
| [src/anim/resolve.ts](src/anim/resolve.ts) | Request -> best clip + playback rate |
| [src/anim/library.ts](src/anim/library.ts) | Loading, root-motion stripping, rig rescaling |
| [src/anim/animatedActor.ts](src/anim/animatedActor.ts) | Skinned character driven by the above |
| [src/anim/requirements.ts](src/anim/requirements.ts) | The slots the game needs - the shopping list |
| [tools/mixamo-fetch.mjs](tools/mixamo-fetch.mjs) | Downloads the shopping list from your own Mixamo account |

If a model is missing or its rig is not recognised, the character falls back to
a code-generated placeholder body and the game keeps running.
