import "@shopify/ui-extensions/preact";
import {render} from 'preact';
import {useEffect, useState} from 'preact/hooks';

import { APP_HANDLE } from "./config/appConfig";

export default async () => {
  render(<Extension />, document.body);
}

function Extension() {
  const {i18n, close, data, navigation , extension: {target}} = shopify;
  console.log({data});
  const [productTitle, setProductTitle] = useState('');
  const [productHandle, setProductHandle] = useState('');

  

  
  // Use direct API calls to fetch data from Shopify.
  // See https://shopify.dev/docs/api/admin-graphql for more information about Shopify's GraphQL API
  useEffect(() => {
    (async function getProductInfo() {
      const getProductQuery = {
        query: `query Product($id: ID!) {
          product(id: $id) {
            title
            handle
          }
        }`,
        variables: {id: data.selected[0].id},
      };

      const res = await fetch("shopify:admin/api/graphql.json", {
        method: "POST",
        body: JSON.stringify(getProductQuery),
      });

      if (!res.ok) {
        console.error('Network error');
      }

      const productData = await res.json();
      setProductTitle(productData.data.product.title);
      setProductHandle(productData.data.product.handle);
    })();
  }, [data.selected]);
  return (
    // The AdminAction component provides an API for setting the title and actions of the Action extension wrapper.
    <s-admin-action>
      <s-stack direction="block">
        {/* Set the translation values for each supported language in the locales directory */}
        <s-text type="strong">{i18n.translate('welcome', {target})}</s-text>
        <s-text>Current product: {productTitle}</s-text>
      </s-stack>
      <s-button
  slot="primary-action"
   
  onClick={() => {
    
    console.log("clicked");
    console.log("product handle: ", productHandle);
    navigation.navigate(
  `/admin/apps/${APP_HANDLE}/app/products/${productHandle}/edit`
  );
    close();
  }}
>
  Open Product Editor
</s-button>
      <s-button slot="secondary-actions" onClick={() => {
          console.log('closing');
          close();
      }}>Close</s-button>
    </s-admin-action>
  );
}