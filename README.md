# Product Edit Flow

## Overview

This project is a Shopify embedded app page for editing product information.

The page contains two tabs:

* Media
* SEO

A global Save and Discard section is available at the top and works across both tabs.

## Features Implemented

### Media Tab

* View existing product images
* Add image using image URL
* Remove images
* Edit image alt text
* Reorder images using Up/Down buttons
* Select featured image
* Basic media validations

### SEO Tab

* Lazy loaded SEO data
* Edit SEO title, SEO Description, SEO Handle
* Display canonical URL
* Handle basic validations

## Save / Discard

### Save

Only changed sections are updated.

The application compares current values with original values and executes only the required Shopify mutations.

### Discard

Reverts all unsaved changes back to the original product values.


## Diff Strategy

Before saving, the application checks:

* Image additions
* Image removals
* Image reorder changes
* Alt text changes
* SEO title changes
* SEO description changes
* Handle changes

If no changes are found, no mutation is executed.


## Shopify Mutations Used

### Media

* `productCreateMedia`
* `productUpdateMedia`
* `productReorderMedia`
* `productDeleteMedia`

### SEO

* `productUpdate`

## Notes

This project was developed using:

* React
* React Router
* Shopify Admin GraphQL API

The focus was on implementing the Product Edit Flow, lazy loading, diff-based updates, and cross-tab state persistence.

### Author

Ambigaa
