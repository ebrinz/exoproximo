# Exoproximo

This repository contains a series of Jupyter notebooks for analyzing and classifying near-Earth objects (NEOs) using spectral data, API queries, and machine learning. The primary goal is to gain insights into NEO compositions and behavior, leveraging data from NASA and related sources.

## Notebooks

### 1. `neo_analysis.ipynb`
   - **Objective**: Perform data extraction, preprocessing, normalization, and feature engineering for NEO spectral data.
   - **Key Functions**:
     - **Data Loading**: Imports spectral and metadata from Marsset and Binzel studies.
     - **Data Merging and Cleaning**: Merges spectral data with observational metadata, handling timestamps and missing values.
     - **Normalization and Feature Extraction**:
       - Normalize reflectance data to correct for measurement variations.
       - Calculate spectral slopes and band depths/centers, revealing potential mineral compositions.
   - **Visualizations**: Displays correlation heatmaps to explore feature relationships and performs anomaly detection.

### 2. `neo_api_query.ipynb`
   - **Objective**: Retrieve and organize NEO data from online astronomical databases.
   - **Key Features**:
     - **JPL Horizons**: Queries for closest approaches of selected NEOs.
     - **PDS Small Bodies Node**: Pulls metadata and observational parameters.
     - **Data Integration**: Combines API-sourced data with existing NEO data to enhance analysis capabilities.

### 3. `keppler_objs_random_forest.ipynb`
   - **Objective**: Build and evaluate a random forest classifier for Kepler Objects of Interest (KOI), focused on exoplanet classification.
   - **Key Components**:
     - **Data Querying**: Retrieves and filters KOI data from NASA’s Exoplanet Archive.
     - **Feature Engineering**: Selects relevant features, handles missing data, and normalizes inputs.
     - **Classification**:
       - Initial random forest classification and performance evaluation.
       - Hyperparameter tuning with GridSearch for optimized classification accuracy.
       - Cross-validation to ensure robustness and prevent overfitting.
   - **Visualizations**: Feature importance plots and classification reports to evaluate model performance.

