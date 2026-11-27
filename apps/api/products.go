package main

// Hak produk per organisasi. Satu akun Raqio (SSO) bisa memegang Competitor Scraping, WA-Suite, atau keduanya;
// login tetap satu, tetapi produk yang tidak dimiliki tidak terbuka.
//
//	go run . products list [EMAIL]
//	go run . products grant EMAIL wasuite      (berlaku untuk org yang dimiliki EMAIL sebagai owner)
//	go run . products revoke EMAIL scraping

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"strings"
	"text/tabwriter"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	productScraping = "scraping" // Competitor Scraping: Research, SEO, Marketing Agent
	productWASuite  = "wasuite"  // WA-Suite: Customer Service Agent
)

var productNames = map[string]string{
	productScraping: "Competitor Scraping (Research, SEO, dan Marketing Agent)",
	productWASuite:  "WA-Suite (Customer Service Agent)",
}

func knownProduct(p string) bool { _, ok := productNames[p]; return ok }

// parseProducts: "scraping,wasuite" → daftar unik yang dikenal; nil bila ada nama yang tidak dikenal.
func parseProducts(csv string) []string {
	seen := map[string]bool{}
	out := []string{}
	for _, p := range strings.Split(csv, ",") {
		p = strings.TrimSpace(strings.ToLower(p))
		if p == "" || seen[p] {
			continue
		}
		if !knownProduct(p) {
			return nil
		}
		seen[p] = true
		out = append(out, p)
	}
	return out
}

func grantProducts(ctx context.Context, tx pgx.Tx, orgID string, products []string) error {
	for _, p := range products {
		if !knownProduct(p) {
			continue
		}
		if _, err := tx.Exec(ctx, `INSERT INTO org_products (org_id, product) VALUES ($1,$2) ON CONFLICT DO NOTHING`, orgID, p); err != nil {
			return err
		}
	}
	return nil
}

func (a *App) orgProducts(ctx context.Context, orgID string) []string {
	out := []string{}
	rows, err := a.db.Query(ctx, `SELECT product FROM org_products WHERE org_id=$1 ORDER BY product`, orgID)
	if err != nil {
		slog.Warn("org_products", "err", err)
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var p string
		if rows.Scan(&p) == nil {
			out = append(out, p)
		}
	}
	return out
}

func (a *App) hasProduct(ctx context.Context, orgID, product string) (bool, error) {
	var ok bool
	err := a.db.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM org_products WHERE org_id=$1 AND product=$2)`, orgID, product).Scan(&ok)
	return ok, err
}

// requireProduct: endpoint produk hanya untuk org yang memegang produk itu (403 product_required).
func (a *App) requireProduct(product string, next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		s := sess(r)
		if s == nil {
			errJSON(w, 401, "Belum login.")
			return
		}
		ok, err := a.hasProduct(r.Context(), s.OrgID, product)
		if err != nil {
			errJSON(w, 500, "db")
			return
		}
		if !ok {
			errCode(w, 403, "product_required", "Akun ini belum memiliki "+productNames[product]+".")
			return
		}
		next(w, r)
	}
}

// productsCLI: subperintah "products". Cukup DATABASE_URL.
func productsCLI(args []string) int {
	usage := func() int {
		fmt.Fprintln(os.Stderr, `pakai:
  products list [EMAIL]            produk per org (semua org, atau org milik EMAIL)
  products grant EMAIL PRODUK      beri produk ke org yang dimiliki EMAIL (owner)
  products revoke EMAIL PRODUK     cabut produk dari org yang dimiliki EMAIL
PRODUK: scraping (Competitor Scraping) | wasuite (WA-Suite)`)
		return 2
	}
	if len(args) == 0 {
		return usage()
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, env("DATABASE_URL", devDSN))
	if err != nil {
		fmt.Fprintln(os.Stderr, "db:", err)
		return 1
	}
	defer pool.Close()
	if err := pool.Ping(ctx); err != nil {
		fmt.Fprintln(os.Stderr, "db ping:", err)
		return 1
	}
	if err := migrate(ctx, pool); err != nil {
		fmt.Fprintln(os.Stderr, "migrate:", err)
		return 1
	}
	out := tabwriter.NewWriter(os.Stdout, 0, 2, 2, ' ', 0)
	defer out.Flush()
	ownerOrgs := `SELECT m.org_id FROM memberships m JOIN users u ON u.id=m.user_id WHERE lower(u.email)=lower($1) AND m.role='owner' AND u.deleted_at IS NULL`

	switch args[0] {
	case "list":
		q := `SELECT o.name, o.plan, COALESCE(string_agg(p.product, ',' ORDER BY p.product), '-') FROM orgs o
			LEFT JOIN org_products p ON p.org_id=o.id`
		qargs := []any{}
		if len(args) > 1 {
			q += ` WHERE o.id IN (` + ownerOrgs + `)`
			qargs = append(qargs, args[1])
		}
		q += ` GROUP BY o.id, o.name, o.plan, o.created_at ORDER BY o.created_at DESC LIMIT 200`
		rows, err := pool.Query(ctx, q, qargs...)
		if err != nil {
			fmt.Fprintln(os.Stderr, "db:", err)
			return 1
		}
		defer rows.Close()
		fmt.Fprintln(out, "ORG\tPAKET\tPRODUK")
		for rows.Next() {
			var name, plan, products string
			if err := rows.Scan(&name, &plan, &products); err != nil {
				fmt.Fprintln(os.Stderr, "db:", err)
				return 1
			}
			fmt.Fprintf(out, "%s\t%s\t%s\n", name, plan, products)
		}
	case "grant", "revoke":
		if len(args) != 3 || !knownProduct(args[2]) {
			return usage()
		}
		sql := `INSERT INTO org_products (org_id, product) SELECT org_id, $2::text FROM (` + ownerOrgs + `) o ON CONFLICT DO NOTHING`
		if args[0] == "revoke" {
			sql = `DELETE FROM org_products WHERE product=$2 AND org_id IN (` + ownerOrgs + `)`
		}
		tag, err := pool.Exec(ctx, sql, args[1], args[2])
		if err != nil {
			fmt.Fprintln(os.Stderr, "db:", err)
			return 1
		}
		fmt.Fprintf(out, "%s %s: %d org\n", args[0], productNames[args[2]], tag.RowsAffected())
	default:
		return usage()
	}
	return 0
}
