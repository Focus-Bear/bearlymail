// file-type v22+ ships types only via the package "exports.types" conditional,
// which is not resolvable under tsconfig moduleResolution "node" (classic). The
// package is consumed via dynamic `import("file-type")` at runtime, so we only
// need to declare the subset of types the codebase actually touches.
declare module "file-type" {
  export type FileTypeResult = {
    readonly ext: string;
    readonly mime: string;
  };

  export function fileTypeFromBuffer(
    buffer: Uint8Array | ArrayBuffer,
  ): Promise<FileTypeResult | undefined>;
}
