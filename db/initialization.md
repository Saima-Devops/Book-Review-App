# Database initialization

MySQL creates the configured database and application user on the first start.
The existing backend synchronizes its Sequelize models and inserts sample books
when the Books table is empty. No additional schema or seed SQL is needed.
Do not mount duplicate initialization scripts or replace an existing data volume.
