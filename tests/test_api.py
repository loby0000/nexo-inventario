import json, unittest, uuid, urllib.request, urllib.error, http.cookiejar, os
BASE=os.environ.get('NEXO_TEST_URL','http://127.0.0.1:5184')
class ApiTests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.client=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
  cls.client.open(BASE+'/signin-with-chatgpt?return_to=%2F').read()
 def call(self,body=None,origin=None,authenticated=True):
  headers={'Content-Type':'application/json'}
  if origin:headers['Origin']=origin
  r=urllib.request.Request(BASE+'/api/inventory',data=json.dumps(body).encode() if body else None,headers=headers)
  try:
   response=(self.client.open(r) if authenticated else urllib.request.urlopen(r))
   return response.status,json.load(response)
  except urllib.error.HTTPError as e:
   raw=e.read().decode();e.close()
   try:return e.code,json.loads(raw)
   except json.JSONDecodeError:return e.code,{'error':raw}
 def test_anonymous_rejected(self):self.assertEqual(self.call(authenticated=False)[0],401)
 def test_csrf_rejected(self):self.assertEqual(self.call({'action':'demo'},origin='https://other.example')[0],403)
 def test_full_product_lifecycle_and_validation(self):
  p={'action':'product','name':'Prueba API','sku':'API-'+uuid.uuid4().hex[:8],'category':'Calidad','supplier':'','unit':'unidad','cost':10000,'price':20000,'minimum':2}
  code,result=self.call(p);self.assertEqual(code,200,result);pid=result['id']
  self.assertEqual(self.call(p)[0],409)
  self.assertEqual(self.call({**p,'sku':'negative','cost':-1})[0],400)
  movement={'action':'movement','id':str(uuid.uuid4()),'productId':pid,'type':'in','quantity':5,'note':'Compra de prueba'}
  self.assertEqual(self.call(movement)[0],200);self.assertEqual(self.call(movement)[0],200)
  product=next(x for x in self.call()[1]['products'] if x['id']==pid);self.assertEqual(product['stock'],5)
  self.assertEqual(self.call({**movement,'id':str(uuid.uuid4()),'type':'out','quantity':6})[0],409)
  self.assertEqual(self.call({'action':'archive','id':pid,'archived':True})[0],409)
  self.assertEqual(self.call({**movement,'id':str(uuid.uuid4()),'type':'out'})[0],200)
  self.assertEqual(self.call({**p,'id':pid,'name':'Producto editado'})[0],200)
  self.assertEqual(self.call({'action':'archive','id':pid,'archived':True})[0],200)
  self.assertEqual(self.call({**movement,'id':str(uuid.uuid4())})[0],409)
  self.assertEqual(self.call({'action':'archive','id':pid,'archived':False})[0],200)
  self.assertEqual(self.call({'action':'archive','id':pid,'archived':True})[0],200)
 def test_invalid_movement_rejected(self):
  self.assertEqual(self.call({'action':'movement','id':str(uuid.uuid4()),'productId':'unknown','type':'in','quantity':1,'note':'Prueba'})[0],409)
 def test_demo_does_not_overwrite_inventory(self):self.assertEqual(self.call({'action':'demo'})[0],409)

if __name__=='__main__':unittest.main(verbosity=2)
