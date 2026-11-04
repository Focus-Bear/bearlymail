import { randomUUID } from "crypto";
import { FindOperator, Repository } from "typeorm";

type Row = Record<string, unknown>;
type Where = Row | Row[];

function compare(actual: unknown, expected: unknown): boolean {
  if (!(expected instanceof FindOperator)) return actual === expected;
  const operand: unknown = expected.value;
  switch (expected.type) {
    case "isNull":
      return actual === null || actual === undefined;
    case "moreThan":
      return actual != null && (actual as number) > (operand as number);
    case "lessThan":
      return actual != null && (actual as number) < (operand as number);
    default:
      throw new Error(
        `InMemoryRepository: unsupported operator ${expected.type}`,
      );
  }
}

function matches(row: Row, where: Where): boolean {
  const branches = Array.isArray(where) ? where : [where];
  return branches.some((branch) =>
    Object.entries(branch).every(([key, value]) => compare(row[key], value)),
  );
}

/**
 * The slice of TypeORM's Repository the OAuth services use (create, save,
 * findOne, find, count, update, delete), backed by an array, with support for
 * IsNull / MoreThan / LessThan and OR-arrays. Lets specs exercise the real
 * conditional updates (single-use codes, refresh rotation races) without a DB.
 */
export class InMemoryRepository<T extends object> {
  readonly rows: T[] = [];

  constructor(private readonly defaults: () => Partial<T> = () => ({})) {}

  create(input: Partial<T>): T {
    return { ...input } as T;
  }

  async save(entity: T): Promise<T> {
    const row = {
      id: randomUUID(),
      createdAt: new Date(),
      ...this.defaults(),
      ...entity,
    } as T;
    this.rows.push(row);
    return row;
  }

  async findOne(options: { where: Where }): Promise<T | null> {
    return this.rows.find((row) => matches(row as Row, options.where)) ?? null;
  }

  async find(options: { where: Where }): Promise<T[]> {
    return this.rows.filter((row) => matches(row as Row, options.where));
  }

  async count(options: { where: Where }): Promise<number> {
    return (await this.find(options)).length;
  }

  async update(
    where: Where,
    changes: Partial<T>,
  ): Promise<{ affected: number }> {
    const targets = this.rows.filter((row) => matches(row as Row, where));
    targets.forEach((row) => Object.assign(row, changes));
    return { affected: targets.length };
  }

  async delete(where: Where): Promise<{ affected: number }> {
    const before = this.rows.length;
    const kept = this.rows.filter((row) => !matches(row as Row, where));
    this.rows.splice(0, this.rows.length, ...kept);
    return { affected: before - kept.length };
  }

  asRepository(): Repository<T> {
    return this as unknown as Repository<T>;
  }
}
