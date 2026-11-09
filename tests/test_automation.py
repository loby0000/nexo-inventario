import unittest,uuid,concurrent.futures
from test_api import ApiTests
class AutomationTests(ApiTests):
 def create(self,**overrides):
  data={'action':'product','name':'Producto automático','sku':'AUTO-'+uuid.uuid4().hex[:10],'barcode':uuid.uuid4().hex[:12],'category':'Pruebas','supplier':'Proveedor','unit':'unidad','cost':120000,'price':200000,'minimum':2,**overrides}
  code,result=self.call(data);self.assertEqual(code,200,result);return result['id'],data
 def getproduct(self,id):return next(p for p in self.call()[1]['products'] if p['id']==id)
 def doc(self,kind,lines,**overrides):return {'action':'document','id':str(uuid.uuid4()),'type':kind,'reference':'QA-'+uuid.uuid4().hex[:8],'contact':'Prueba','note':'Operación de prueba','lines':[{'productId':id,'quantity':q,'unitPrice':p} for id,q,p in lines],**overrides}
 def test_purchase_sale_and_retries(self):
  p,_=self.create();d=self.doc('purchase',[(p,10,120000)]);self.assertEqual(self.call(d)[0],200);self.assertEqual(self.call(d)[0],200);self.assertEqual(self.getproduct(p)['stock'],10)
  self.assertEqual(self.call({**d,'contact':'Otro contacto'})[0],409)
  sale=self.doc('sale',[(p,4,200000)]);self.assertEqual(self.call(sale)[0],200);self.assertEqual(self.getproduct(p)['stock'],6)
  document=next(doc for doc in self.call()[1]['documents'] if doc['id']==sale['id']);self.assertEqual(document['total'],800000)
 def test_atomic_failure_has_no_partial_effect(self):
  p,_=self.create();q,_=self.create();self.assertEqual(self.call(self.doc('purchase',[(p,5,10),(q,1,20)]))[0],200)
  sale=self.doc('sale',[(p,2,10),(q,2,20)]);self.assertEqual(self.call(sale)[0],409);self.assertEqual(self.getproduct(p)['stock'],5);self.assertEqual(self.getproduct(q)['stock'],1);self.assertNotIn(sale['id'],[d['id'] for d in self.call()[1]['documents']])
 def test_duplicate_lines_rejected(self):
  p,_=self.create();self.assertEqual(self.call(self.doc('purchase',[(p,2,10),(p,3,10)]))[0],400)
 def test_auto_sku_and_unique_barcode(self):
  p,data=self.create(sku='');self.assertTrue(self.getproduct(p)['sku'].startswith('NX-'));data['sku']='DIFFERENT-'+uuid.uuid4().hex[:8];self.assertEqual(self.call(data)[0],409)
 def test_import_valid_and_idempotent(self):
  _,p=self.create();p.pop('action');p['sku']='IMP-'+uuid.uuid4().hex[:8];p['barcode']='';body={'action':'import','id':str(uuid.uuid4()),'rows':[p]};self.assertEqual(self.call(body)[0],200);self.assertEqual(self.call(body)[0],200);self.assertEqual(sum(1 for x in self.call()[1]['products'] if x['sku']==p['sku'].upper()),1)
 def test_import_collision_rolls_back(self):
  _,p=self.create();p.pop('action');q={**p,'sku':'NEW-'+uuid.uuid4().hex[:8],'barcode':''};body={'action':'import','id':str(uuid.uuid4()),'rows':[q,p]};self.assertEqual(self.call(body)[0],409);self.assertNotIn(q['sku'].upper(),[x['sku'] for x in self.call()[1]['products']])
 def test_import_duplicates_and_limit(self):
  _,p=self.create();p.pop('action');self.assertEqual(self.call({'action':'import','id':str(uuid.uuid4()),'rows':[p,p]})[0],409);self.assertEqual(self.call({'action':'import','id':str(uuid.uuid4()),'rows':[p]*101})[0],400)
 def test_workspace_isolation(self):
  import urllib.request,urllib.error,json
  r=urllib.request.Request('http://127.0.0.1:5184/api/inventory?workspace=someone-else')
  with self.assertRaises(urllib.error.HTTPError) as error:self.client.open(r)
  self.assertEqual(error.exception.code,403)
 def test_workspace_configuration(self):
  self.assertEqual(self.call({'action':'workspace','name':'Nexo QA','description':'Negocio de pruebas'})[0],200);self.assertEqual(self.call()[1]['workspace']['name'],'Nexo QA')
 def test_movement_id_cannot_be_reused_for_other_data(self):
  p,_=self.create();m={'action':'movement','id':str(uuid.uuid4()),'productId':p,'type':'in','quantity':1,'note':'Prueba de identificador'};self.assertEqual(self.call(m)[0],200);self.assertEqual(self.call({**m,'quantity':2})[0],409)
 def test_concurrent_sales_do_not_overdraw(self):
  p,_=self.create();self.assertEqual(self.call(self.doc('purchase',[(p,1,100)]))[0],200);a=self.doc('sale',[(p,1,100)]);b=self.doc('sale',[(p,1,100)])
  with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:results=list(executor.map(lambda d:self.call(d)[0],[a,b]))
  self.assertEqual(sorted(results),[200,409]);self.assertEqual(self.getproduct(p)['stock'],0)
 def test_product_creation_is_idempotent(self):
  request_id=str(uuid.uuid4());p,data=self.create(sku='',createId=request_id);self.assertEqual(p,request_id);self.assertEqual(self.call(data)[0],200);self.assertEqual(self.call({**data,'name':'Otro nombre'})[0],409)
if __name__=='__main__':unittest.main(verbosity=2)
