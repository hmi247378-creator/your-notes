-- Create tables for Your Notes (Cloudflare D1 / SQLite)

CREATE TABLE IF NOT EXISTS User (
    id TEXT PRIMARY KEY,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    nickname TEXT,
    email TEXT UNIQUE,
    passwordHash TEXT,
    wechatOpenId TEXT UNIQUE
);

CREATE TABLE IF NOT EXISTS Tag (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    name TEXT NOT NULL,
    color TEXT,
    parentId TEXT,
    path TEXT NOT NULL,
    depth INTEGER NOT NULL,
    keywords TEXT, -- Store as JSON string
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (userId) REFERENCES User(id),
    FOREIGN KEY (parentId) REFERENCES Tag(id)
);

CREATE INDEX IF NOT EXISTS idx_tag_user_path ON Tag(userId, path);
CREATE INDEX IF NOT EXISTS idx_tag_user_parent ON Tag(userId, parentId);

CREATE TABLE IF NOT EXISTS IngestBatch (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    rawText TEXT NOT NULL,
    recordedAt DATETIME,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (userId) REFERENCES User(id)
);

CREATE INDEX IF NOT EXISTS idx_ingest_user_created ON IngestBatch(userId, createdAt);

CREATE TABLE IF NOT EXISTS Note (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    contentMd TEXT NOT NULL,
    contentPlain TEXT NOT NULL,
    source TEXT NOT NULL,
    archived BOOLEAN DEFAULT 0,
    recordedAt DATETIME,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    deletedAt DATETIME,
    batchId TEXT,
    FOREIGN KEY (userId) REFERENCES User(id),
    FOREIGN KEY (batchId) REFERENCES IngestBatch(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_note_user_created ON Note(userId, createdAt);
CREATE INDEX IF NOT EXISTS idx_note_batch ON Note(batchId);

CREATE TABLE IF NOT EXISTS Reminder (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    noteId TEXT NOT NULL,
    status TEXT DEFAULT '待处理',
    remindAt DATETIME,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (userId) REFERENCES User(id) ON DELETE CASCADE,
    FOREIGN KEY (noteId) REFERENCES Note(id) ON DELETE CASCADE,
    UNIQUE(userId, noteId)
);

CREATE INDEX IF NOT EXISTS idx_reminder_user ON Reminder(userId);

CREATE TABLE IF NOT EXISTS NoteTag (
    noteId TEXT NOT NULL,
    tagId TEXT NOT NULL,
    PRIMARY KEY (noteId, tagId),
    FOREIGN KEY (noteId) REFERENCES Note(id) ON DELETE CASCADE,
    FOREIGN KEY (tagId) REFERENCES Tag(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ClassificationSuggestion (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    noteId TEXT,
    inputText TEXT NOT NULL,
    suggestedTags TEXT NOT NULL, -- JSON string
    chosenTags TEXT, -- JSON string
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ClassificationFeedback (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    noteId TEXT NOT NULL,
    beforeTags TEXT, -- JSON string
    afterTags TEXT NOT NULL, -- JSON string
    reason TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ChangeLog (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId TEXT NOT NULL,
    entityType TEXT NOT NULL,
    entityId TEXT NOT NULL,
    op TEXT NOT NULL,
    payload TEXT, -- JSON string
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_changelog_user_id ON ChangeLog(userId, id);

CREATE TABLE IF NOT EXISTS ProcessedMutation (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    clientMutationId TEXT NOT NULL,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(userId, clientMutationId)
);
