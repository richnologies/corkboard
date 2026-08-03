import { Person, PersonType } from '@org/domain';
import { PersonDocument } from './person.schema.js';

/** Legacy DB values removed from PersonType are folded here. */
function normalizePersonType(type: string): PersonType {
  if (type === 'colleague') return PersonType.Other;
  if (Object.values(PersonType).includes(type as PersonType)) {
    return type as PersonType;
  }
  return PersonType.Other;
}

export function mapPerson(
  doc: PersonDocument,
  stats?: { sourceCount: number; visitCount: number },
): Person {
  return {
    id: doc.id,
    ownerId: String(doc.ownerId),
    name: doc.name,
    type: normalizePersonType(doc.type),
    linkedUserId: doc.linkedUserId ? String(doc.linkedUserId) : undefined,
    sourceCount: stats?.sourceCount ?? 0,
    visitCount: stats?.visitCount ?? 0,
    createdAt: doc.createdAt?.toISOString() ?? new Date().toISOString(),
    updatedAt: doc.updatedAt?.toISOString() ?? new Date().toISOString(),
  };
}
