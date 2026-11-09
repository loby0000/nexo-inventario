import sqlite3, unittest
from pathlib import Path

class InventoryTests(unittest.TestCase):
 def setUp(self):
  self.db=sqlite3.connect(':memory:')
  self.db.execute('PRAGMA foreign_keys=ON')
  for migration in sorted(Path('drizzle').glob('*.sql')):
   self.db.executescript(migration.read_text(encoding='utf-8-sig'))
  self.db.execute("INSERT INTO products(id,owner,name,sku,category,cost,price,minimum,created_at,updated_at) VALUES('p','a','Prueba','SKU','General',100,200,2,'2026-11-05','2026-11-05')")
 def movement(self,id='m',owner='a',kind='in',quantity=10):
  self.db.execute('INSERT INTO movements(id,owner,product_id,type,quantity,note,actor,created_at) VALUES(?,?,?,?,?,?,?,?)',(id,owner,'p',kind,quantity,'Prueba','user@example.com','2026-11-05'))
 def stock(self):return self.db.execute('SELECT stock FROM products').fetchone()[0]
 def test_entry_and_exit_update_stock(self):
  self.movement();self.movement('out',kind='out',quantity=4);self.assertEqual(self.stock(),6)
 def test_overdraw_is_atomic(self):
  self.movement()
  with self.assertRaises(sqlite3.IntegrityError):self.movement('bad',kind='out',quantity=11)
  self.assertEqual(self.stock(),10);self.assertEqual(self.db.execute('SELECT COUNT(*) FROM movements').fetchone()[0],1)
 def test_cross_owner_rejected(self):
  with self.assertRaises(sqlite3.IntegrityError):self.movement(owner='b')
  self.assertEqual(self.stock(),0)
 def test_nonpositive_rejected(self):
  for n in [0,-1]:
   with self.assertRaises(sqlite3.IntegrityError):self.movement(quantity=n)
 def test_invalid_kind_rejected(self):
  with self.assertRaises(sqlite3.IntegrityError):self.movement(kind='other')
 def test_archived_product_rejects_movement(self):
  self.db.execute('UPDATE products SET archived=1')
  with self.assertRaises(sqlite3.IntegrityError):self.movement()
 def test_sku_unique_within_business(self):
  sql="INSERT INTO products(id,owner,name,sku,category,cost,price,created_at,updated_at) VALUES(?,?,'Other','SKU','General',0,0,'today','today')"
  with self.assertRaises(sqlite3.IntegrityError):self.db.execute(sql,('q','a'))
  self.db.execute(sql,('r','b'))
 def test_no_negative_stock_or_cost(self):
  with self.assertRaises(sqlite3.IntegrityError):self.db.execute('UPDATE products SET stock=-1')
  with self.assertRaises(sqlite3.IntegrityError):self.db.execute('UPDATE products SET cost=-1')
 def test_duplicate_movement_no_double_effect(self):
  self.movement()
  self.db.execute("INSERT OR IGNORE INTO movements SELECT * FROM movements WHERE id='m'")
  self.assertEqual(self.stock(),10)
 def test_guarded_insert_out_of_stock_and_other_owner(self):
  sql="INSERT OR IGNORE INTO movements(id,owner,product_id,type,quantity,note,actor,created_at) SELECT ?,owner,id,?,?,?,?,? FROM products WHERE id=? AND owner=? AND archived=0 AND (?='in' OR stock>=?)"
  self.db.execute(sql,('bad','out',1,'test','actor','today','p','a','out',1));self.assertEqual(self.stock(),0)
  self.db.execute(sql,('bad','in',1,'test','actor','today','p','b','in',1));self.assertEqual(self.stock(),0)
 def test_archive_requires_empty_stock(self):
  self.movement();r=self.db.execute("UPDATE products SET archived=1 WHERE id='p' AND owner='a' AND stock=0");self.assertEqual(r.rowcount,0)

if __name__=='__main__':unittest.main(verbosity=2)
