http://smass.mit.edu/minuspubs.html

MITHNEOS MIT-Hawaii Near-Earth Object Spectroscopic Survey
Data format, data rejection, and data normalization notes
Filenames are in the format:

aNNNNNN, where NNNNNN is the asteroid number.
auYYYYPD, where YYYYPD is the provisional designation, if unnumbered.
Files are space delimited, with four columns.

Column 1: Wavelength in microns
Column 2: Normalized reflectance.
Normalization is at 0.55 micron, when visible wavelength data are available. Otherwise, normalization is made near 1.21 microns (weighted average over 1.16 to 1.26 microns). This value is set to −1 in the case of a rejected datum. Rejected data values should not be plotted or used in any model fitting of the spectrum.
Column 3: One-sigma uncertainty for the reflectance value.
This value is set to −1 in the case of a rejected datum.
Column 4: Number of individual reduced Spex images averaged together to produce the final reflectance value at this wavelength.
The column 4 entry is equal to "0" in the case of a rejected datum. For visible wavelength SMASS data, this value is arbitrarily set equal to "1" (as the number of averaged points is not maintained in the SMASS archive).
When available, visible wavelength data from the SMASS survey are included. The SMASS data are listed first, followed by a blank line, followed by the SpeX data. SMASS data are normalized to unity at 0.55 microns. SpeX data are scaled to fit the SMASS data using the ~0.8 to ~0.9 micron region where SMASS and SpeX data overlap. SMASS data are held fixed while the SpeX data are scaled to fit under the criteria of maintaining a constant first derivative (slope) and minimizing the chi-squared scattering. Ultimately subjective judgement is used in concluding the "best fit." Users of these data are advised to apply their own data normalization algorithm if their model results or science interpretation is strongly influenced by the final fit between the independent SMASS visible wavelength spectra and these near-infrared spectral data sets.