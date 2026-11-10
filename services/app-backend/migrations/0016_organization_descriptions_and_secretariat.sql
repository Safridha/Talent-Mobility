ALTER TABLE divisions
    ADD COLUMN description TEXT NOT NULL DEFAULT '',
    ADD COLUMN secretariat_name TEXT NOT NULL DEFAULT '',
    ADD COLUMN secretariat_description TEXT NOT NULL DEFAULT '';

ALTER TABLE departments
    ADD COLUMN description TEXT NOT NULL DEFAULT '';

ALTER TABLE bureaus
    ADD COLUMN description TEXT NOT NULL DEFAULT '';
