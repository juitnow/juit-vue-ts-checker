export class Deferred<T> {
  readonly promise: Promise<T>
  readonly resolve!: (result: T) => void
  readonly reject!: (error: Error) => void

  constructor() {
    this.promise = new Promise<T>((resolver, rejector) => {
      Object.defineProperties(this, {
        resolve: { value: resolver },
        reject: { value: rejector },
      })
    })
  }
}
