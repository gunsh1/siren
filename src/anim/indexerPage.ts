import * as THREE from 'three'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'
import { detectSkeletonPrefix, findBones, restHeightUnits, restHipsUnits, sampleClip } from './sample'
import { buildEntry, detectUnitScale, measure } from './analyze'
import type { AnimEntry, AnimIndex } from './types'

/**
 * Runs inside a headless browser because three's FBXLoader needs DOM APIs.
 * The Node driver (tools/anim-index.mjs) hands it a file list and writes the
 * result to public/models/anim/anim-index.json.
 */

export interface IndexResult {
  index: AnimIndex
  errors: { file: string; message: string }[]
}

async function analyseFile(url: string, loader: FBXLoader): Promise<{
  entries: AnimEntry[]
  heightMeters: number
  prefix: string
}> {
  const group = await loader.loadAsync(url)
  const bones = findBones(group)
  const rawHeight = restHeightUnits(group, bones)
  const { scale, heightMeters } = detectUnitScale(rawHeight)
  const rig = { heightUnits: rawHeight, hipsUnits: restHipsUnits(group, bones) }

  const label = url.split('/').pop() ?? url
  const file = url.replace(/^\//, '')
  const entries: AnimEntry[] = []

  group.animations.forEach((clip, i) => {
    if (clip.duration <= 0) return
    const frames = sampleClip(group, bones, clip, scale)
    const m = measure(frames, heightMeters, clip.duration)
    const base = label.replace(/\.fbx$/i, '')
    const id = group.animations.length > 1 ? `${base}#${i}` : base
    entries.push(buildEntry(id, file, clip.name, label, m, rig))
  })

  // Free the GPU-less geometry immediately; a large library would otherwise
  // hold every mesh it ever parsed.
  group.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (mesh.geometry) mesh.geometry.dispose()
  })

  return { entries, heightMeters, prefix: detectSkeletonPrefix(bones) }
}

declare global {
  interface Window {
    __buildAnimIndex: (files: string[]) => Promise<IndexResult>
  }
}

window.__buildAnimIndex = async (files: string[]): Promise<IndexResult> => {
  const loader = new FBXLoader()
  const entries: AnimEntry[] = []
  const errors: { file: string; message: string }[] = []
  let referenceHeight = 0
  let skeleton = 'unknown'

  for (const file of files) {
    try {
      const result = await analyseFile(file, loader)
      entries.push(...result.entries)
      referenceHeight = referenceHeight || result.heightMeters
      if (skeleton === 'unknown') skeleton = result.prefix
    } catch (err) {
      errors.push({ file, message: err instanceof Error ? err.message : String(err) })
    }
  }

  entries.sort((a, b) => a.id.localeCompare(b.id))

  return {
    index: {
      version: 1,
      skeleton,
      referenceHeight,
      generatedFrom: files,
      entries,
    },
    errors,
  }
}

document.body.textContent = 'anim indexer ready'
