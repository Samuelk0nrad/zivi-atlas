import {sqliteTable, text, integer, index, primaryKey, uniqueIndex} from 'drizzle-orm/sqlite-core';

export const collections = sqliteTable('collections', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  name: text('name').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, table => [index('collections_owner_idx').on(table.ownerId)]);

export const collectionItems = sqliteTable('collection_items', {
  collectionId: text('collection_id').notNull().references(() => collections.id, {onDelete:'cascade'}),
  orgCode: integer('org_code').notNull(),
  title: text('title').notNull(),
  branch: text('branch').notNull(),
  city: text('city').notNull(),
  addedAt: text('added_at').notNull(),
}, table => [primaryKey({columns:[table.collectionId, table.orgCode]})]);

export const labels = sqliteTable('labels', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  name: text('name').notNull(),
  nameKey: text('name_key').notNull(),
  color: text('color').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, table => [uniqueIndex('labels_owner_name_idx').on(table.ownerId,table.nameKey)]);

export const labelItems = sqliteTable('label_items', {
  labelId: text('label_id').notNull().references(()=>labels.id,{onDelete:'cascade'}),
  orgCode: integer('org_code').notNull(),
  addedAt: text('added_at').notNull(),
}, table => [primaryKey({columns:[table.labelId,table.orgCode]})]);

export const emailDrafts=sqliteTable('email_drafts',{
  id:text('id').primaryKey(),ownerId:text('owner_id').notNull(),orgCode:integer('org_code'),orgTitle:text('org_title').notNull(),
  recipient:text('recipient').notNull(),subject:text('subject').notNull(),body:text('body').notNull(),revision:integer('revision').notNull().default(1),
  createdAt:text('created_at').notNull(),updatedAt:text('updated_at').notNull(),
  state:text('state').notNull().default('active'),sentAt:text('sent_at'),
},table=>[index('email_drafts_owner_updated_idx').on(table.ownerId,table.updatedAt)]);

export const applications=sqliteTable('applications',{
 id:text('id').primaryKey(),ownerId:text('owner_id').notNull(),orgCode:integer('org_code').notNull(),orgTitle:text('org_title').notNull(),contactEmail:text('contact_email').notNull(),status:text('status').notNull().default('automatic'),notes:text('notes').notNull().default(''),revision:integer('revision').notNull().default(1),createdAt:text('created_at').notNull(),updatedAt:text('updated_at').notNull(),lastImportAt:text('last_import_at'),nextAction:text('next_action').notNull().default('automatic'),
},table=>[uniqueIndex('applications_owner_org_idx').on(table.ownerId,table.orgCode)]);
export const applicationEmails=sqliteTable('application_emails',{
 id:text('id').primaryKey(),applicationId:text('application_id').notNull().references(()=>applications.id,{onDelete:'cascade'}),ownerId:text('owner_id').notNull(),sourceAccount:text('source_account').notNull(),messageId:text('message_id').notNull(),threadId:text('thread_id').notNull(),direction:text('direction').notNull(),occurredAt:text('occurred_at').notNull(),from:text('sender').notNull(),to:text('recipients').notNull(),cc:text('cc').notNull(),subject:text('subject').notNull(),body:text('body').notNull(),bodyTruncated:integer('body_truncated',{mode:'boolean'}).notNull(),importedAt:text('imported_at').notNull(),
},table=>[uniqueIndex('application_emails_owner_message_idx').on(table.ownerId,table.sourceAccount,table.messageId),index('application_emails_timeline_idx').on(table.applicationId,table.occurredAt)]);

export const draftAttachments=sqliteTable('draft_attachments',{
 id:text('id').primaryKey(),draftId:text('draft_id').references(()=>emailDrafts.id,{onDelete:'set null'}),ownerId:text('owner_id').notNull(),objectKey:text('object_key').notNull(),filename:text('filename').notNull(),contentType:text('content_type').notNull(),size:integer('size').notNull(),createdAt:text('created_at').notNull(),
},table=>[index('draft_attachments_owner_idx').on(table.ownerId,table.draftId)]);

// Each Gmail handoff owns an immutable copy of the exported draft and attachments.
export const gmailHandoffs=sqliteTable('gmail_handoffs',{
 id:text('id').primaryKey(),ownerId:text('owner_id').notNull(),draftId:text('draft_id').notNull(),revision:integer('revision').notNull(),snapshotId:text('snapshot_id').notNull().references(()=>emailDrafts.id,{onDelete:'cascade'}),account:text('account').notNull(),gmailDraftId:text('gmail_draft_id'),threadId:text('thread_id'),messageId:text('message_id'),createdAt:text('created_at').notNull(),
},table=>[index('gmail_handoffs_owner_account_idx').on(table.ownerId,table.account),uniqueIndex('gmail_handoffs_snapshot_idx').on(table.snapshotId)]);
