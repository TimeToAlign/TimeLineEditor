/** Pure application of all 24 commands to an immutable workspace view. */

import { dumps } from "@timetoalign/timeskeleton";
import { applyToManifest } from "../commands/apply.ts";
import { parseCommand } from "../commands/parse.ts";
import type {
  Command,
  CreateBlock,
  DeleteRecords,
  ManifestCommand,
  MoveRecords,
  RecordCommand,
  ResizeRecord,
  SetBlockManifest,
  SetIndex,
  SetRecordProperties,
  SetSettings,
} from "../commands/types.ts";
import { MANIFEST_COMMAND_TYPES } from "../commands/types.ts";
import type { CommandError, Problem } from "../errors.ts";
import { ErrorCode, isCommandError, isLoadError, problem } from "../errors.ts";
import { loadManifest } from "../manifest/io.ts";
import type { Manifest } from "../manifest/types.ts";
import { RECORD_ID } from "./ids.ts";
import { indexBetween, isIndex } from "./order.ts";
import type { BlockRecord, RecordId, WorkspaceRecord } from "./records.ts";
import type { View } from "./view.ts";

function prefixed(error: Problem, prefix: readonly (string | number)[]): CommandError {
  return { ...error, path: [...prefix, ...error.path] };
}

/** Load a manifest value; a refusal points below `manifest` of the record `id`. */
function normalizeManifest(value: unknown, id: RecordId): Manifest | CommandError {
  let text: string;
  try {
    text = dumps(value);
  } catch (error) {
    return problem(ErrorCode.schemaViolation, (error as Error).message, [
      "records",
      id,
      "manifest",
    ]);
  }
  const loaded = loadManifest(text);
  if (isLoadError(loaded)) {
    return prefixed(loaded.problems[0] as Problem, ["records", id, "manifest"]);
  }
  return loaded;
}

function find(
  view: View,
  id: RecordId,
  path: readonly (string | number)[],
): WorkspaceRecord | CommandError {
  return view.records[id] ?? problem(ErrorCode.unknownRecord, `record ${id} does not exist`, path);
}

function block(
  view: View,
  id: RecordId,
  path: readonly (string | number)[],
): BlockRecord | CommandError {
  const record = find(view, id, path);
  if (isCommandError(record)) return record;
  return record.kind === "block"
    ? record
    : problem(ErrorCode.notABlock, `record ${id} is not a block`, path);
}

function replaceRecord(view: View, record: WorkspaceRecord): View {
  return { ...view, records: { ...view.records, [record.id]: record } };
}

function createBlock(view: View, command: CreateBlock): View | CommandError {
  if (!RECORD_ID.test(command.id)) {
    return problem(ErrorCode.invalidRecordId, "expected a ten-character lowercase record id", [
      "records",
      command.id,
    ]);
  }
  if (view.records[command.id] !== undefined) {
    return problem(ErrorCode.duplicateRecord, `record ${command.id} already exists`, [
      "records",
      command.id,
    ]);
  }
  const manifest = normalizeManifest(command.manifest, command.id);
  if (isCommandError(manifest)) return manifest;
  const roots = Object.values(view.records).filter((record) => record.parent === null);
  const greatest = roots.reduce<string | null>(
    (found, record) =>
      isIndex(record.index) && (found === null || found < record.index) ? record.index : found,
    null,
  );
  const defaults = view.settings.blockDefaults;
  const record: BlockRecord = {
    id: command.id,
    kind: "block",
    blockKind: "timeline",
    parent: null,
    index: indexBetween(greatest, null),
    x: command.x,
    y: command.y,
    scale: command.scale ?? defaults.scale,
    length: command.length ?? defaults.length,
    spacing: command.spacing ?? defaults.spacing,
    width: command.width === undefined ? defaults.width : command.width,
    height: command.height === undefined ? defaults.height : command.height,
    order: command.order ?? defaults.order,
    overrides: {},
    manifest,
  };
  return replaceRecord(view, record);
}

function moveRecords(view: View, command: MoveRecords): View | CommandError {
  for (const move of command.moves) {
    const record = find(view, move.id, ["records", move.id]);
    if (isCommandError(record)) return record;
    if (!("x" in record && "y" in record)) {
      return problem(ErrorCode.invalidCommand, `record ${move.id} has no movable position`, [
        "records",
        move.id,
      ]);
    }
  }
  const records = { ...view.records };
  for (const move of command.moves) {
    const record = records[move.id] as WorkspaceRecord & { readonly x: number; readonly y: number };
    records[move.id] = { ...record, x: move.x, y: move.y } as WorkspaceRecord;
  }
  return { ...view, records };
}

function resizeRecord(view: View, command: ResizeRecord): View | CommandError {
  const record = block(view, command.id, ["records", command.id]);
  if (isCommandError(record)) return record;
  switch (command.mode) {
    case "scale":
      return replaceRecord(view, { ...record, scale: command.scale });
    case "box":
      return replaceRecord(view, { ...record, width: command.width, height: command.height });
    case "stretch":
      return replaceRecord(view, {
        ...record,
        length: command.length ?? record.length,
        spacing: command.spacing ?? record.spacing,
      });
  }
}

function setRecordProperties(view: View, command: SetRecordProperties): View | CommandError {
  const record = block(view, command.id, ["records", command.id]);
  if (isCommandError(record)) return record;
  return replaceRecord(view, { ...record, ...command.properties });
}

function setIndex(view: View, command: SetIndex): View | CommandError {
  const record = find(view, command.id, ["records", command.id]);
  if (isCommandError(record)) return record;
  if (!isIndex(command.index)) {
    return problem(ErrorCode.invalidIndex, "expected a valid fractional index", [
      "records",
      command.id,
      "index",
    ]);
  }
  const duplicate = Object.values(view.records).find(
    (item) =>
      item.id !== command.id && item.parent === record.parent && item.index === command.index,
  );
  if (duplicate !== undefined) {
    return problem(ErrorCode.duplicateIndex, `sibling ${duplicate.id} already has that index`, [
      "records",
      command.id,
      "index",
    ]);
  }
  return replaceRecord(view, { ...record, index: command.index });
}

function deleteRecords(view: View, command: DeleteRecords): View | CommandError {
  for (const id of command.ids) {
    const record = find(view, id, ["records", id]);
    if (isCommandError(record)) return record;
  }
  const removed = new Set(command.ids);
  let changed = true;
  while (changed) {
    changed = false;
    for (const record of Object.values(view.records)) {
      if (!removed.has(record.id) && record.parent !== null && removed.has(record.parent)) {
        removed.add(record.id);
        changed = true;
      }
    }
  }
  return {
    ...view,
    records: Object.fromEntries(Object.entries(view.records).filter(([id]) => !removed.has(id))),
  };
}

function setSettings(view: View, command: SetSettings): View {
  return {
    ...view,
    settings: {
      ...view.settings,
      ...(command.settings.styles === undefined ? {} : { styles: command.settings.styles }),
      ...(command.settings.blockDefaults === undefined
        ? {}
        : {
            blockDefaults: {
              ...view.settings.blockDefaults,
              ...command.settings.blockDefaults,
            },
          }),
      ...(command.settings.grid === undefined
        ? {}
        : { grid: { ...view.settings.grid, ...command.settings.grid } }),
    },
  };
}

function setBlockManifest(view: View, command: SetBlockManifest): View | CommandError {
  const record = block(view, command.block, ["records", command.block]);
  if (isCommandError(record)) return record;
  const manifest = normalizeManifest(command.manifest, command.block);
  if (isCommandError(manifest)) return manifest;
  return replaceRecord(view, { ...record, manifest });
}

function applyRecord(view: View, command: RecordCommand): View | CommandError {
  switch (command.type) {
    case "createBlock":
      return createBlock(view, command);
    case "moveRecords":
      return moveRecords(view, command);
    case "resizeRecord":
      return resizeRecord(view, command);
    case "setRecordProperties":
      return setRecordProperties(view, command);
    case "setIndex":
      return setIndex(view, command);
    case "deleteRecords":
      return deleteRecords(view, command);
    case "setSettings":
      return setSettings(view, command);
    case "setBlockManifest":
      return setBlockManifest(view, command);
  }
}

function applyManifest(view: View, command: ManifestCommand): View | CommandError {
  const record = block(view, command.block, ["records", command.block]);
  if (isCommandError(record)) return record;
  const changed = applyToManifest(record.manifest, command);
  if (isCommandError(changed)) {
    return prefixed(changed, ["records", command.block, "manifest"]);
  }
  return replaceRecord(view, { ...record, manifest: changed });
}

export function apply(view: View, command: Command): View | CommandError {
  const parsed = parseCommand(command);
  if (isCommandError(parsed)) return parsed;
  return (MANIFEST_COMMAND_TYPES as readonly string[]).includes(parsed.type)
    ? applyManifest(view, parsed as ManifestCommand)
    : applyRecord(view, parsed as RecordCommand);
}
