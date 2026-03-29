/** Machine-oriented codes for registry dependency resolution (see registry-dependency-management-spec §8). */

export class RegistryDependencyNotFoundError extends Error {
  readonly code = "REGDEP_NOT_FOUND" as const;
  constructor(public readonly ref: string) {
    super(`Registry dependency not found: ${ref}`);
    this.name = "RegistryDependencyNotFoundError";
  }
}

export class RegistryDependencyPermissionDeniedError extends Error {
  readonly code = "REGDEP_PERMISSION_DENIED" as const;
  constructor(public readonly ref: string) {
    super(`Registry dependency access denied (private item): ${ref}`);
    this.name = "RegistryDependencyPermissionDeniedError";
  }
}

export class RegistryDependencyCycleError extends Error {
  readonly code = "REGDEP_CYCLE_DETECTED" as const;
  constructor(public readonly path: string[]) {
    super(`Registry dependency cycle detected: ${path.join(" -> ")}`);
    this.name = "RegistryDependencyCycleError";
  }
}
