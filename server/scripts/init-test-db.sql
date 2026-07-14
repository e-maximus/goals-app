-- The test suite needs a database it can truncate freely, separate from the one
-- holding real goals. Postgres runs this once, when the data volume is created.
CREATE DATABASE goals_test OWNER goals;
