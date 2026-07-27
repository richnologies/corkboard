import { Person } from '@org/domain';
import { PersonDocument } from './person.schema.js';

export function mapPerson(
  doc: PersonDocument,
  stats?: { sourceCount: number; visitCount: number },
): Person {
  return {
    id: doc.id,
    ownerId: String(doc.ownerId),
    name: doc.name,
    type: doc.type,
    linkedUserId: doc.linkedUserId ? String(doc.linkedUserId) : undefined,
    sourceCount: stats?.sourceCount ?? 0,
    visitCount: stats?.visitCount ?? 0,
    createdAt: doc.createdAt?.toISOString() ?? new Date().toISOString(),
    updatedAt: doc.updatedAt?.toISOString() ?? new Date().toISOString(),
  };
}
