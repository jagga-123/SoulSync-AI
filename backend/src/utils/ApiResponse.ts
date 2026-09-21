export class ApiResponse<T = unknown> {
  public readonly success = true as const;
  public readonly message: string;
  public readonly data: T;

  constructor(message: string, data: T) {
    this.message = message;
    this.data = data;
  }
}
