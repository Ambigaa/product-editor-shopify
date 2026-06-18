import { authenticate } from "../shopify.server";
import { useLoaderData, useFetcher } from 'react-router';
import { useEffect, useState } from 'react';
import { useNavigate } from "react-router";

export const loader = async ({ request, params }) => {
    if (!params.handle) {
        throw new Response('Handle is required to load product');
    }
    let admin;
    try {
        ({ admin } = await authenticate.admin(request));
    }
    catch (error) {
        throw new Response("Unauthorized session");
    }

    const url = new URL(request.url);
    const seoRequest = url.searchParams.get("seo") === "true";

    const seoFields = seoRequest ? `
        seo {
            title
            description
        }`: "";

    const response = await admin.graphql(
        `#graphql
            query GetProduct($query: String!) {
        products(first:1, query: $query) {
            nodes {
                id
                title
                handle
                ${seoFields}
                media(first:10) {
                nodes {
                ... on MediaImage {
                id
                alt
                image {
                url
                }}}}
            }
        }
    }`,
        {
            variables: {
                query: `handle:${params.handle}`,
            },
        }
    );
    const json = await response.json();
    console.log(JSON.stringify(json, null, 2));
    const product = json?.data?.products?.nodes?.[0];

    if (!product) {
        throw new Response('Product not found');
    }

    console.log("seo request: ", seoRequest);
    console.log("product: ", product);
    console.log("seo: ", product?.seo);
    if (seoRequest) {
        return new Response(
            JSON.stringify({
                seoTitle: product.seo?.title || "",
                seoDescription: product.seo?.description || "",
            }),
            {
                headers: {
                    "Content-Type": "application/json",
                },
            }
        );
    }
    return {
        product: {
            id: product.id,
            title: product.title,
            handle: product.handle,
        },
        images: product.media.nodes
            .filter((image) => image?.image?.url)
            .map((image) => ({
                id: image.id,
                altText: image.alt,
                imageUrl: image.image?.url,
            })),
    };
}

export const action = async ({ request }) => {

    const { admin } = await authenticate.admin(request);
    const formData = await request.formData();

    let removeIds = [];
    let newUrls = [];
    let images = [];
    let originalImages = [];
    let featuredId = [];

    try {
        removeIds = JSON.parse(formData.get("removeIds") || "[]");

        newUrls = JSON.parse(formData.get("newUrls") || "[]");

        images = JSON.parse(formData.get("images") || "[]");

        originalImages = JSON.parse(formData.get('originalImages') || "[]");

        featuredId = formData.get("featuredId");

    }

    catch {
        throw new Response("Invalid product payload");
    }

    const productId = formData.get('productId');

    if (!productId) {
        throw new Response("Invalid product payload");
    }

    console.log("productId:", productId);
    console.log("removeIds:", removeIds);
    console.log("newUrls: ", newUrls);
    console.log("images: ", images);
    console.log("FeaturedId:", featuredId);

    const seoTitle = formData.get("seoTitle") || "";
    const seoDescription = formData.get("seoDescription") || "";
    const handle = formData.get("handle") || "";

    if (seoTitle.length > 70) {
        throw new Response("Title too long");
    }

    if (seoDescription.length > 320) {
        throw new Response("Description too long");
    }

    const seoHandle = formData.get("handle");
    const originalSeoTitle = formData.get("originalSeoTitle") || "";
    const originalSeoDescription = formData.get("originalSeoDescription") || "";
    const originalHandle = formData.get("originalHandle") || "";

    const noSeoChanges = seoTitle === originalSeoTitle && seoDescription === originalSeoDescription && handle === originalHandle;

    const noReorderChanges = JSON.stringify(images.map((image) => image.id)
    ) ===
        JSON.stringify(
            originalImages.map(
                (image) => image.id
            )
        );

    const noAltTextChanges = JSON.stringify(images.map(
        (image) => image.altText
    )) ===
        JSON.stringify(
            originalImages.map(
                (image) => image.altText
            )
        );
    
    if (removeIds.length === 0 &&
        newUrls.length === 0 &&
        noAltTextChanges &&
        noReorderChanges && noSeoChanges) {
            return { 
                success: true 
            };
    }    

    if (newUrls.length > 0) {
        const createResponse = await admin.graphql(
            `#graphql
            mutation productCreateMedia($productId: ID!, $media: [CreateMediaInput!]!) {
                productCreateMedia(productId: $productId, media: $media) {
                    media {
                        alt
                        mediaContentType
                        status
                    }
                    mediaUserErrors {
                        field
                        message
                    }
                }
            }`,
            {
                variables: {
                    productId,
                    media: newUrls.map((url) => ({
                        originalSource: url,
                        mediaContentType: "IMAGE",
                    })),
                },
            }
        );
        console.log('create result');
        const createJson = await createResponse.json();
        console.log(JSON.stringify(createJson, null, 2));
    }

    const media = images.filter((image) => !image.id.startsWith("temp-"))
        .map((image) => ({
            id: image.id,
            alt: image.altText,
        }));

    if (!noAltTextChanges) {
        const updateResponse = await admin.graphql(
            `#graphql
            mutation productUpdateMedia($productId: ID!, $media: [UpdateMediaInput!]!) {
                productUpdateMedia(productId: $productId, media: $media) {
                    media {
                        id
                        alt
                    }
                    mediaUserErrors {
                        field
                        message
                    }
                }
            }`,
            {
                variables: {
                    productId,
                    media,
                },
            }
        );
        const updateJson = await updateResponse.json();
        console.log("UpdateMedia Result: ", JSON.stringify(updateJson, null, 2));
    }


    if (!noReorderChanges) {
        const moves = images.filter(image => !image.id.startsWith("temp-"))
            .map((image, index) => ({
                id: image.id,
                newPosition: String(index),
            }));

        const reorderResponse = await admin.graphql(
            `#graphql
            mutation productReorderMedia($id: ID!, $moves: [MoveInput!]!) {
                productReorderMedia(id: $id, moves: $moves) {
                    job {
                        id
                    } 
                    mediaUserErrors {
                        field
                        message
                    }
                }
            }`,
            {
                variables: {
                    id: productId,
                    moves,
                },
            }
        );

        const reorderJson = await reorderResponse.json();
        console.log("reordered:", JSON.stringify(reorderJson, null, 2));
    }
    if (removeIds.length > 0) {
        const deleteResponse = await admin.graphql(
            `mutation productDeleteMedia($productId: ID!, $mediaIds: [ID!]!) {
                productDeleteMedia(productId: $productId, mediaIds: $mediaIds) {
                    deletedMediaIds
        
                    mediaUserErrors {
                        field
                        message
                    }
                    product {
                        id
                    }
                }
            }`,
            {
                variables: {
                    productId,
                    mediaIds: removeIds,
                },
            }
        );
        const json = await deleteResponse.json();
        console.log(JSON.stringify(json, null, 2));
    }

    if (!handle.trim()) {
        throw new Response("Handle is required to update product");
    }

    const handleRegex = /^[a-z0-9-]+$/;
    if (!handleRegex.test(handle)) {
        throw new Response("Invalid product payload");
    }

    const handleCheckResponse = await admin.graphql(
        `#graphql
        query CheckHandle($query: String!) {
            products(first:1, query: $query) {
                nodes {
                    id
                    handle
                }
            }
        }`,
        {
            variables: {
                query: `handle:${seoHandle}`,
            },
        }
    );
    const handleCheckJson = await handleCheckResponse.json();

    const existingProduct = handleCheckJson?.data?.products?.nodes[0];

    if (existingProduct && existingProduct.id !== productId) {
        return {
            success: false,
            error: `URL handle "${seoHandle}" is already in use.`,
        };
    }

    if (!noSeoChanges) {
        const seoResponse = await admin.graphql(
            `#graphql
            mutation productUpdate($product: ProductUpdateInput!) {
                productUpdate(product: $product) {
                    product {
                        id
                        handle
            
                        seo {
                            title
                            description
                        }
                    }
                    userErrors {
                        field
                        message
                    }
                }
            }`,
            {
                variables: {
                    product: {
                        id: productId,
                        handle: handle,

                        seo: {
                            title: seoTitle,
                            description: seoDescription,

                        },
                    },
                },
            }
        );
        const seoJson = await seoResponse.json();
        console.log("SEO update result: ", JSON.stringify(seoJson, null, 2));
    }
    return {
        success: true,
        newHandle: handle,
    };
    
}


export default function EditProduct() {
    const data = useLoaderData();

    const [activeTab, setActiveTab] = useState("media");

    const [newUrl, setNewUrl] = useState("");

    const [formState, setFormState] = useState({
        featuredId: data.images?.[0]?.id || null,

        images: data.images || [],
        removeIds: [],
        newUrls: [],

        seoTitle: "",
        seoDescription: "",
        handle: data.product.handle,
    });

    const { featuredId, images, removeIds, newUrls, seoTitle, seoDescription, handle } = formState;

    const setImages = (images) =>
        setFormState((prev) => ({
            ...prev,
            images: typeof images === "function" ? images(prev.images) : images,
        }));

    const setRemoveIds = (removeIds) =>
        setFormState((prev) => ({
            ...prev,
            removeIds: typeof removeIds === "function" ? removeIds(prev.removeIds) : removeIds,
        }));

    const setNewUrls = (newUrls) =>
        setFormState((prev) => ({
            ...prev,
            newUrls: typeof newUrls === "function" ? newUrls(prev.newUrls) : newUrls,
        }));

    const setSeoTitle = (seoTitle) =>
        setFormState((prev) => ({
            ...prev,
            seoTitle,
        }));

    const setSeoDescription = (seoDescription) =>
        setFormState((prev) => ({
            ...prev,
            seoDescription,
        }));

    const setHandle = (handle) =>
        setFormState((prev) => ({
            ...prev,
            handle,
        }));

    const setFeaturedId = (featuredId) =>
        setFormState((prev) => ({
            ...prev,
            featuredId,
        }));

    const [seoLoaded, setSeoLoaded] = useState(false);
    const [seoError, setSeoError] = useState("");
    const [saveMessage, setSaveMessage] = useState("");

    const [originalSeoTitle, setOriginalSeoTitle] = useState("");
    const [originalSeoDescription, setOriginalSeoDescription] = useState("");

    const [originalImages, setOriginalImages] = useState(data.images);
    const [originalFeaturedId] = useState(data.images[0]?.id || null);
    const [originalHandle] = useState(data.product.handle);

    const isDirty = JSON.stringify(formState.images) !== JSON.stringify(originalImages) ||
        formState.removeIds.length > 0 ||
        formState.newUrls.length > 0 ||
        formState.seoTitle !== originalSeoTitle ||
        formState.seoDescription !== originalSeoDescription ||
        formState.handle !== originalHandle;

    const saveFetcher = useFetcher();
    const seoFetcher = useFetcher();
    const navigate = useNavigate();

    useEffect(() => {
        if (activeTab === "seo" && !seoLoaded && seoFetcher.state === "idle") {
            setSeoError("");
            try {
                seoFetcher.load(`/app/products/${data.product.handle}/edit?seo=true`);
            }
            catch {
                setSeoError("Unable to load SEO data right now. Please try again.");
            }
        }
    }, [activeTab, seoLoaded, seoFetcher.state, data.product.handle]);

    useEffect(() => {
        if (seoFetcher.data) {
            setSeoTitle(seoFetcher.data.seoTitle || "");
            setSeoDescription(seoFetcher.data.seoDescription || "");
            setOriginalSeoTitle(seoFetcher.data.seoTitle || "");
            setOriginalSeoDescription(seoFetcher.data.seoDescription || "");
            setSeoLoaded(true);
        }
    }, [seoFetcher.data]);

    useEffect(() => {
        if (saveFetcher.data?.success && saveFetcher.data?.newHandle ) {
            setTimeout(() => {
                navigate(`/app/products/${saveFetcher.data.newHandle}/edit`);
            }, 1000);
            
        }
    }, [saveFetcher.data, navigate]);

    useEffect(() => {
        if(saveFetcher.data?.success) {
            setOriginalImages(images);
            setFormState(prev => ({
                ...prev,
                removeIds:[],
                newUrls:[],
            }));
        }
    }, [saveFetcher.data]);

    useEffect(() => {
        if(saveFetcher.data?.success) {        
            setSaveMessage("Changes saved successfully!");
   
            const timer = setTimeout(
                    () => {setSaveMessage("");}, 3000);
            return () => clearTimeout(timer);
        }
    }, [saveFetcher.data]);

    const handleAddImage = () => {
        if (!newUrl.trim()) {
            alert("Please enter an image URL.");
            return;
        }
        try {
            const url = new URL(newUrl);
            if (url.protocol  !== "https:" && url.protocol !== "http:") {
                alert("Please enter a valid URL.");
                return;
            }
        }
        catch {
            alert("Please enter a valid URL.");
            return;
        }

        if (images.length >= 250) {
            alert("Maximum 250 images allowed.");
            return;
        }
        setNewUrls((prev) => [...prev, newUrl]);

        setImages((prev) => [
            ...prev,
            {
                id: `temp-${Date.now()}`,
                imageUrl: newUrl,
                altText: data.product.title,
            }
        ]);
        setNewUrl("");
    }

    const handleRemove = (id) => {
        if (images.length === 1) {
            alert('At least one image is required before removing the featured image.');
            return;
        }
        if (featuredId === id) {
            const remaining = images.filter(img => img.id !== id);

            setFeaturedId(remaining[0].id || null);
        }
        setRemoveIds((prev) => [...prev, id]);

        setImages((prev) => prev.filter((image) => image.id !== id));
    };

    const handleAltTextChange = (id, value) => {
        setImages((prev) =>
            prev.map((image) =>
                image.id === id ? {
                    ...image,
                    altText: value,
                }
                    : image));
    };


    const moveUp = (id) => {
        const index = images.findIndex(
            (image) => image.id === id
        );
        if (index === 0) return;

        const updated = [...images];

        [updated[index - 1], updated[index]] = [updated[index], updated[index - 1]];

        setImages(updated);
    };

    const moveDown = (id) => {
        const index = images.findIndex(
            (image) => image.id === id
        );
        if (index === images.length - 1) return;

        const updated = [...images];

        [updated[index + 1], updated[index]] = [updated[index], updated[index + 1]];

        setImages(updated);

    };

    const handleDiscard = () => {
        setFormState({
            featuredId: originalFeaturedId,
            images: originalImages,
            removeIds: [],
            newUrls: [],
            seoTitle: originalSeoTitle,
            seoDescription: originalSeoDescription,
            handle: originalHandle,
        });
    };

    const handleSave = () => {
        console.log('log clicked');

        console.log({
            productId: data.product.id,
            removeIds: JSON.stringify(removeIds),
            newUrls: JSON.stringify(newUrls),
            featuredId,
        });

        saveFetcher.submit(
            {
                // _tab: activeTab,
                productId: data.product.id,
                removeIds: JSON.stringify(removeIds),
                newUrls: JSON.stringify(newUrls),
                featuredId,
                images: JSON.stringify(images),

                originalImages: JSON.stringify(data.images),

                seoTitle,
                seoDescription,
                handle,

                originalSeoTitle,
                originalSeoDescription,
                originalHandle: data.product.handle,
            },
            {
                method: 'post',
            }
        );
    };

    console.log("data", data);
    return (
        <div>
            <h2>Edit product</h2>

            <div style={{
                display: "flex",
                gap: "20px",
                marginBottom: "20px",
                padding: "10px",
                border: "1px solid #ddd",
                backgroundColor: "#f5f5f5",
                alignItems: "center",
            }}>
                <button onClick={handleSave}
                    disabled={!isDirty}>Save</button>
                <button disabled={!isDirty}
                    onClick={handleDiscard}>Discard</button>

                {saveMessage && (
                    <p style={{color: "green", margin: 0}}>{saveMessage}</p>
                )}
            </div>
            <div style={{
                display: "flex",
                gap: "10px",
                marginBottom: "20px",
            }}>
                <button onClick={() => setActiveTab("media")}>
                    Media
                </button>
                <button
                    onClick={() => setActiveTab("seo")}>
                    SEO
                </button>
            </div>

            <h3>Product Details</h3>
            <h4>{data.product.title}</h4>
            {/* <p style={{color: "#666"}}>Handle: {data.product.handle}</p> */}
            <br/>
            {activeTab === "media" && (
                <>

                    <div>
                        <h3>Media Management</h3>
                        <h4>Add Product Image</h4>
                        <input
                            type="text"
                            placeholder="Enter image URL"
                            value={newUrl}
                            onChange={(e) =>
                                setNewUrl(e.target.value)
                            }
                            style={{
                                marginRight: "8px",
                                padding: "3px",
                                width: "300px",
                            }}
                        />
                        <button
                            style={{

                                padding: "5px",
                                margin: "8px",
                                cursor: "pointer",
                                backgroundColor: "#4c9f58",
                                border: "1px solid green",
                                borderRadius: "3px",
                                color: "white"
                            }}
                            onClick={handleAddImage}>Add Image</button>
                    </div>
                    <br />

                    <h3>Product Images</h3>
                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns: 'repeat(3, 1fr)',
                            gap: '16px',
                        }}>
                        {images.map((image) => (
                            <div
                                key={image.id}
                                style={{
                                    border: "1px solid #818181",
                                    borderRadius: "5px",
                                    padding: "10px",
                                }}>
                                <img src={image.imageUrl}
                                    alt={image.altText}
                                    width="200px"
                                    height="100px"
                                />
                                <input
                                    type='text'
                                    value={image.altText || ""}
                                    maxLength={512}
                                    onChange={(e) =>
                                        handleAltTextChange(image.id, e.target.value)
                                    }
                                    style={{
                                        margin: "8px",
                                    }}/>
                                <div style={{
                                    display: "flex",
                                    alignItems: "center",
                                    marginTop: "8px",
                                }}>
                                    <input type="radio"
                                        name="featuredImage"
                                        checked={featuredId === image.id}
                                        onChange={() => {
                                            setFeaturedId(image.id);
                                            const selected = images.find(
                                                img => img.id === image.id
                                            );
                                            const others = images.filter(
                                                img => img.id !== image.id
                                            );
                                            setImages([
                                                selected, ...others
                                            ]);
                                        }}
                                    />
                                    <label style={{ marginRight: "6px", }}>Featured</label>

                                    <div>
                                        <button
                                            onClick={() => moveUp(image.id)}
                                            style={{
                                                marginRight: "5px",
                                            }}>Up</button>
                                        <button
                                            onClick={() => moveDown(image.id)}
                                            style={{
                                                marginRight: "5px",
                                            }}>Down</button>
                                    </div>
                                </div>
                                <button
                                    style={{
                                        backgroundColor: "#E97451",
                                        color: "white",
                                        border: "none",
                                        padding: "8px 12px",
                                        marginTop: "15px",
                                        marginBottom: "5px",
                                        cursor: "pointer",
                                        borderRadius: "4px",
                                    }}
                                    onClick={() => handleRemove(image.id)}>Remove</button>
                            </div>
                        ))}
                    </div>
                </>
            )}

            {activeTab === "seo" && (
                <>
                    <h3>SEO Settings</h3>
                    {seoError && (
                        <p style={{ color: "red" }}>{seoError}</p>
                    )}
                    {seoFetcher.state === "loading" && (
                        <p>loading seo...</p>
                    )}
                    <div
                        style={{
                            border: "1px solid #ddd",
                            padding: "16px",
                            marginBottom: "20px",
                        }}>
                        <div>
                            <label>SEO title</label>
                            <br />
                            <input
                                type="text"
                                maxLength={70}
                                value={seoTitle}
                                onChange={(e) => setSeoTitle(e.target.value)}
                                style={{
                                    width: "400px",
                                    padding: "8px",
                                    marginTop: "5px",
                                }}
                            />
                        </div>
                        <br />
                        <div>
                            <label>SEO description</label>
                            <br />
                            <textarea
                                maxLength={320}
                                value={seoDescription}
                                onChange={(e) => setSeoDescription(e.target.value)}
                                rows={4}
                                style={{
                                    width: "400px",
                                    padding: "8px",
                                    marginTop: "5px",
                                }}
                            />
                        </div>
                        <br />
                        <div>
                            <label>Handle</label>
                            <br />
                            <input
                                type="text"
                                value={handle}
                                onChange={(e) => setHandle(e.target.value)}
                                style={{
                                    width: "400px",
                                    padding: "8px",
                                    marginTop: "5px",
                                }}
                            />
                            <br />
                            <div style={{ marginTop: "20px", }}>
                                <label> Canonical URL</label>
                                <br />
                                <input readOnly value={`https://admin.shopify.com/store/gaalora-dev-store/products/${handle}`}
                                    style={{
                                        width: "400px",
                                        backgroundColor: "#ffffff",
                                        marginTop: "5px",
                                        padding: "6px",
                                        border: "1px solid #525050"
                                    }} />
                            </div>
                            {saveFetcher.data?.error && (
                                <p style={{ color: "red", marginTop: "10px", }}>
                                    {saveFetcher.data.error}
                                </p>
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
