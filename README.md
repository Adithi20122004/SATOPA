# MHA Field Companion (SIH Hackathon — Ministry of Education's Innovation Cell)
### Colorimetric Drug-Test Kit Field Companion & Tamper-Evident Forensic Verification PWA

> **STATUTORY FORENSIC ADVISORY**: This mobile application produces **presumptive screening indications only**. In strict accordance with the Narcotics Drugs and Psychotropic Substances (NDPS) Act and international evidentiary standards (UNODC/ENFSI), results generated in the field do not constitute confirmatory laboratory identification and must be corroborated by certified forensic gas chromatography-mass spectrometry (GC-MS) or high-performance liquid chromatography (HPLC).

---

## 1. Executive Summary & Problem Statement

Field narcotics enforcement officers routinely rely on presumptive chemical reagent test kits (e.g., Marquis, Mecke, Simon's, Froehde, Duquenois-Levine). However, field execution faces severe vulnerabilities:
1. **Subjective Human Visual Bias**: Lighting variation (direct sunlight, warm street tungsten, dim warehouse lighting) distorts perception of subtle reagent color shifts.
2. **Evidentiary Chain-of-Custody Gaps**: Paper test results are easily contested in court due to lack of tamper-evident timestamps, geographic provenance, and cryptographic seals.
3. **Hardware Burden**: Specialized handheld spectrometers cost thousands of dollars and cannot be ubiquitously deployed to every field officer.

**MHA Field Companion** turns any standard smartphone camera into a calibrated forensic capture and verification terminal using an existing, zero-cost printable **A6 Reference Color Card** without requiring any proprietary hardware.

---

## 2. Core End-to-End System Architecture

```
                                    +-----------------------------------------+
                                    |    Camera / Gallery Image Capture       |
                                    | (Mobile Rear Camera or High-Res Upload) |
                                    +-----------------------------------------+
                                                         |
                                                         v
                                    +-----------------------------------------+
                                    |     Vision Quality Gates Verification   |
                                    | - A6 Reference Card & ArUco Markers 0-3 |
                                    | - Laplacian Variance Blur (Threshold 80)|
                                    | - Exposure Luminance (Range 35 - 230)   |
                                    | - Specular Glare Saturation (<= 4%)     |
                                    | - Perspective Tilt Angle (<= 20 deg)    |
                                    | - Quad-Quadrant Illumination Variance   |
                                    +-----------------------------------------+
                                      |                                     |
                          [Quality Check Passed]                  [Quality Check Failed]
                                      |                                     |
                                      v                                     v
                  +-----------------------------------+             [Enforce INCONCLUSIVE]
                  |  Least-Squares Lighting Correction|             (Specific Retake Advisory)
                  |    - 9 Reference Color Swatches   |
                  |    - Fits 3x3 Calibration Matrix  |
                  +-----------------------------------+
                                      |
                                      v
                  +-----------------------------------+
                  |  CIEDE2000 (ΔE₀₀) Classification  |
                  |    - Distance to Nominal Classes  |
                  |    - Acceptance Threshold (T)     |
                  |    - Runner-up Margin (M)         |
                  +-----------------------------------+
                                      |
                                      v
                  +-----------------------------------+
                  |    Cryptographic Digital Record   |
                  |  - RFC 8785 Canonical JSON       |
                  |  - Full-Res Image SHA-256 Digest  |
                  |  - WebCrypto ECDSA P-256 Signature|
                  |  - Backward Hash Chain Link       |
                  |  - GPS Geolocation & Timestamp    |
                  +-----------------------------------+
                                      |
                         +------------+------------+
                         |                         |
                         v                         v
       +-------------------------------+   +------------------------------------+
       |   Persistent IndexedDB Ledger |   |   Court-Ready PDF Evidence Report  |
       |  - Immediate reactive sync    |   |  - Full Image & Swatch ΔE Table    |
       |  - Instant search & filter    |   |  - Cryptographic Hashes & QR Code  |
       |  - Continuous chain integrity |   |  - GPS, Operator, Official Notice  |
       +-------------------------------+   +------------------------------------+
```

---

## 3. Mathematical & Algorithmic Foundation

### A. Perspective Rectification (DLT Homography)
When the user captures an angled photo, 4 corner ArUco markers (\#0 TL, \#1 TR, \#2 BR, \#3 BL) define quadrilateral source coordinates $P_s = \{(x_i, y_i)\}_{i=0}^3$. Using Direct Linear Transformation (DLT) with Gaussian elimination, the system calculates a $3 \times 3$ homography matrix $H$:

$$\begin{bmatrix} x_d \\ y_d \\ 1 \end{bmatrix} \sim H \begin{bmatrix} x_s \\ y_s \\ 1 \end{bmatrix}$$

Inverse bilinear mapping reconstructs the A6 card into a canonical $600 \times 850$ pixel planar coordinate space, isolating the 9 calibration swatches and the center reaction window.

### B. Least-Squares Color Normalization Matrix
To neutralize non-standard illuminants (such as 3000K tungsten yellow casts or fluorescent blue spikes), measured linear RGB vectors $X_{meas} \in \mathbb{R}^{9 \times 3}$ from the 9 reference patches are aligned against standard nominal D65 linear RGB vectors $Y_{nominal} \in \mathbb{R}^{9 \times 3}$ by solving the normal equations:

$$M = (X^T X)^{-1} X^T Y$$

The calibrated linear RGB color of the reaction window is:

$$RGB_{calibrated} = M \cdot RGB_{raw}$$

### C. CIEDE2000 ($\Delta E_{00}$) Metric
Classification operates strictly in CIE $L^*a^*b^*$ color space using the standard ISO/CIE 11664-6 (CIEDE2000) perceptual difference formula, accounting for lightness non-linearities, chroma weighting, and hue rotation in the blue region:

$$\Delta E_{00} = \sqrt{\left(\frac{\Delta L'}{k_L S_L}\right)^2 + \left(\frac{\Delta C'}{k_C S_C}\right)^2 + \left(\frac{\Delta H'}{k_H S_H}\right)^2 + R_T \left(\frac{\Delta C'}{k_C S_C}\right) \left(\frac{\Delta H'}{k_H S_H}\right)}$$

### D. Abstain-First Decision Boundaries
Unlike consumer classifiers that force an artificial guess, the system implements strict forensic abstention:
- If any Quality Gate fails $\rightarrow$ **INCONCLUSIVE**
- If top distance $\Delta E_{00} > T$ (Kit Acceptance Threshold) $\rightarrow$ **INCONCLUSIVE**
- If separation margin between top class and runner-up class $\Delta E_{runner-up} - \Delta E_{top} < M$ (Kit Separation Margin) $\rightarrow$ **INCONCLUSIVE**
- Otherwise $\rightarrow$ **POSITIVE** or **NEGATIVE**

---

## 4. Cryptographic Integrity & Anti-Tamper Security Model

Every test result is cryptographically sealed directly on the field device:
1. **RFC 8785 Canonical JSON Serialization**: Eliminates non-deterministic whitespace, key ordering, or Unicode variance before hashing.
2. **Image SHA-256 Digest**: Computed directly from the raw captured pixel bytes. Changing a single pixel invalidates the record.
3. **WebCrypto ECDSA P-256 Signing**: Uses non-exportable hardware-backed keypairs (`ECDSA` over curve `P-256` with SHA-256) to sign the canonical record string.
4. **Append-Only Sequential Hash Chain**: Every record embeds the cryptographic hash of its predecessor:
   $$H_n = \text{SHA-256}(\text{Canonical}(R_n)) \quad \text{where } R_n.\text{previous\_record\_hash} = H_{n-1}$$
   If an adversary attempts to delete, insert, or reorder records in the local ledger, the audit log immediately flags: **"Chain broken at record \#N"**.

---

## 5. Mobile & Field Deployment Notes

- **Geolocation (GPS)**: The W3C Geolocation API requires a secure context (**HTTPS** or **localhost**). When testing in local development or deployed on HTTPS Cloud Run/Vercel, the browser prompts for location permission. If GPS is unavailable, permission is denied, or satellite fix times out, the record explicitly logs `"GPS unavailable"` rather than omitting the field.
- **Camera Fallback**: Mobile devices preferentially activate the rear camera (`facingMode: "environment"`). Laptops and desktop webcams fall back to default video sensors. If no camera is available or permission is blocked, the interface displays an integrated gallery file uploader and a 1-click synthetic demo sample loader.
- **PWA & Offline Capability**: Equipped with a Web App Manifest (`manifest.json`) and a cache-first Service Worker (`sw.js`), ensuring complete operational capability in remote areas without cellular connectivity.

---

## 6. Evaluation Methodology & Surrogate Benchmark

The **Eval** tab executes a controlled benchmark comparing classification accuracy **WITH** vs **WITHOUT** reference card calibration across 4 distinct illuminant regimes:
1. Standard CIE D65 (Daylight)
2. 3000K Warm Tungsten
3. Cool White Fluorescent
4. Dim / Underexposed Low-Light

*Note on Data*: The evaluation dataset is a synthetic surrogate dataset designed to rigorously test numerical color-correction stability under controlled illuminant perturbations.

---

## 7. Development & Verification

### Installation & Local Run
```bash
npm install
npm run dev
```

### Run Automated Test Suite
```bash
npm test
```
The test suite validates:
- Hash chain sequencing and tamper detection
- ECDSA P-256 signature generation and invalidation upon metadata modification
- Quality gate thresholds (exposure, sharpness, glare)
- INCONCLUSIVE classification rule enforcement when pointing camera at a blank surface

### Compile & Build Production Bundle
```bash
npm run build
```
