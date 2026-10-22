// 1. The UI's stage-status dropdown has always offered "On Hold", but the
//    original CHECK constraint didn't allow it, so choosing it failed with
//    "Couldn't update: Could not update stage".
// 2. clients.photo_updated_at lets the frontend cache-bust a client's photo
//    URL when it changes, so a replaced photo shows up straight away instead
//    of the browser's cached copy for up to an hour.
exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE project_departments DROP CONSTRAINT IF EXISTS project_departments_status_check;
    ALTER TABLE project_departments ADD CONSTRAINT project_departments_status_check
      CHECK (status IN ('Not Started','In Progress','On Hold','Blocked','Completed'));

    ALTER TABLE clients ADD COLUMN IF NOT EXISTS photo_updated_at TIMESTAMPTZ;
    UPDATE clients SET photo_updated_at = now() WHERE photo_data IS NOT NULL AND photo_updated_at IS NULL;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    UPDATE project_departments SET status = 'Blocked' WHERE status = 'On Hold';
    ALTER TABLE project_departments DROP CONSTRAINT IF EXISTS project_departments_status_check;
    ALTER TABLE project_departments ADD CONSTRAINT project_departments_status_check
      CHECK (status IN ('Not Started','In Progress','Blocked','Completed'));
    ALTER TABLE clients DROP COLUMN IF EXISTS photo_updated_at;
  `);
};
