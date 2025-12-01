# UUID Migration Plan

Converting IDs from sequential integers to UUIDs requires the following changes:

## Entities to Update
1. User entity - `id: number` → `id: string`
2. Email entity - `id: number` → `id: string`, `userId: number` → `userId: string`
3. PriorityRule entity
4. UserContext entity
5. PrivateNote entity
6. SummarizationRule entity
7. Waitlist entity

## Backend Changes Required

### Services
- Update all method signatures: `userId: number` → `userId: string`
- Update all method signatures: `emailId: number` → `emailId: string`
- Remove all `parseInt(id)` calls in controllers
- Update all repository queries

### Controllers
- Remove `parseInt(id)` conversions
- Update route parameter types

### Database
- Create migration script to:
  1. Add new UUID columns
  2. Generate UUIDs for existing records
  3. Update foreign key relationships
  4. Drop old integer columns

### JWT
- Update JWT payload: `sub: user.id` (will become UUID string)

## Frontend Changes Required

### TypeScript Interfaces
- Update all `id: number` → `id: string` in:
  - Email interface
  - User interface
  - All other entity interfaces

### API Calls
- Remove any `parseInt()` calls
- Ensure all ID parameters are strings

## Migration Steps

1. Add UUID support to entities (use `@PrimaryGeneratedColumn('uuid')`)
2. Create database migration
3. Update all backend services and controllers
4. Update frontend interfaces and API calls
5. Test thoroughly
6. Deploy migration

## Note

This is a breaking change that requires:
- Database migration
- Coordinated backend/frontend deployment
- Potential downtime during migration


