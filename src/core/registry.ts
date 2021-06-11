import { logger } from '../lib/logger'

import {
  CompilerOptions,
  createDocumentRegistry,
  DocumentRegistry,
  DocumentRegistryBucketKey,
  IScriptSnapshot,
  Path,
  ScriptKind,
  SourceFile,
} from 'typescript'

import {
  CASE_SENSITIVE_FS,
  cwd,
  resolve,
} from '../lib/files'

const log = logger('document registry')

/**
 * A proxy document registry.
 *
 * This is not currently used, but as I did some investigation in the
 * `DocumentRegistry` class, if we want to implement one on our own in
 * the future this might come handy...
 */
export class VueDocumentRegistry implements DocumentRegistry {
  private readonly reg = createDocumentRegistry(CASE_SENSITIVE_FS, cwd())

  acquireDocumentWithKey(
      fileName: string,
      path: Path,
      compilationSettings: CompilerOptions,
      key: DocumentRegistryBucketKey,
      scriptSnapshot: IScriptSnapshot,
      version: string,
      scriptKind?: ScriptKind,
  ): SourceFile {
    log.debug('Acquiring document', path, key, version)

    return this.reg.acquireDocumentWithKey(
        fileName,
        path,
        compilationSettings,
        key,
        scriptSnapshot,
        version,
        scriptKind,
    )
  }

  updateDocumentWithKey(
      fileName: string,
      path: Path,
      compilationSettings: CompilerOptions,
      key: DocumentRegistryBucketKey,
      scriptSnapshot: IScriptSnapshot,
      version: string,
      scriptKind?: ScriptKind,
  ): SourceFile {
    log.debug('Updating document', path, key, version)

    return this.reg.updateDocumentWithKey(
        fileName,
        path,
        compilationSettings,
        key,
        scriptSnapshot,
        version,
        scriptKind,
    )
  }

  releaseDocumentWithKey(
      path: Path,
      key: DocumentRegistryBucketKey,
      kind?: ScriptKind,
  ): void {
    log.debug('Releasing document', path, key, kind)
    return this.reg.releaseDocumentWithKey(path, key, kind as ScriptKind)
  }

  getKeyForCompilationSettings(
      settings: CompilerOptions,
  ): DocumentRegistryBucketKey {
    const key = this.reg.getKeyForCompilationSettings(settings)
    log.debug('Key for compilation settings', key)
    return key
  }

  reportStats(): string {
    const stats = this.reg.reportStats()
    log.debug('Reporting stats', stats)
    return stats
  }

  /* ======================================================================== *
   * The following three just bounce us up to the other (keyed) functions     *
   * ======================================================================== */

  acquireDocument(
      fileName: string,
      compilationSettings: CompilerOptions,
      scriptSnapshot: IScriptSnapshot,
      version: string,
      scriptKind?: ScriptKind,
  ): SourceFile {
    const file = resolve(fileName)

    return this.acquireDocumentWithKey(
        fileName,
        file,
        compilationSettings,
        this.getKeyForCompilationSettings(compilationSettings),
        scriptSnapshot,
        version,
        scriptKind,
    )
  }

  updateDocument(
      fileName: string,
      compilationSettings: CompilerOptions,
      scriptSnapshot: IScriptSnapshot,
      version: string,
      scriptKind?: ScriptKind,
  ): SourceFile {
    const file = resolve(fileName)

    return this.updateDocumentWithKey(
        fileName,
        file,
        compilationSettings,
        this.getKeyForCompilationSettings(compilationSettings),
        scriptSnapshot,
        version,
        scriptKind,
    )
  }

  releaseDocument(
      fileName: string,
      compilationSettings: CompilerOptions,
  ): void {
    const file = resolve(fileName)

    return this.releaseDocumentWithKey(
        file,
        this.getKeyForCompilationSettings(compilationSettings),
    )
  }
}
