/** A stalled browser decoder must settle so the user can retry or remove a photo. */
export function withTimeout<T>(operation: Promise<T>, milliseconds: number, message: string, disposeLateResult?: (value: T) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    let expired = false;
    const timer = setTimeout(() => { expired = true; reject(new Error(message)); }, milliseconds);
    operation.then(value => {
      clearTimeout(timer);
      if (expired) disposeLateResult?.(value);
      else resolve(value);
    }, error => {
      clearTimeout(timer);
      if (!expired) reject(error);
    });
  });
}
