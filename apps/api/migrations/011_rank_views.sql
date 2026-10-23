-- Halaman peringkat publik: penghitung tampilan per kunci (peringkat per pasangan, atau satu bisnis) per hari.
CREATE TABLE IF NOT EXISTS page_views (
    key  TEXT NOT NULL,        -- "rank:<industri>|<wilayah>" atau "biz:<key>"
    day  DATE NOT NULL,
    n    INT  NOT NULL DEFAULT 0,
    PRIMARY KEY (key, day)
);
