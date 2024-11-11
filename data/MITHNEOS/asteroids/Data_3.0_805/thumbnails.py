"""thumbnails.py
"""
import docopt
import glob
import matplotlib.pyplot as plt
import matplotlib.gridspec as gridspec
from matplotlib.backends.backend_pdf import PdfPages

spectra_texts = glob.glob("*.txt")


font_style = {'fontname':'Arial Unicode MS', 'weight': 'extra bold'}
nplots = len(spectra_texts)

with PdfPages('foo.pdf') as pdf:

    f = plt.figure(figsize=(13,16))
    gs = gridspec.GridSpec(10, 10)

    for i, s in enumerate(spectra_texts):

        name = s.split('.')[0]
        if name[0:2] == 'au':
            name = str(name[2:])
        elif name[0] == 'a':
            name = str(int(name[1:]))
        else:
            name = str(name)

        #print(name)


        wavel = []
        ref = []
        with open(s, 'r') as sfile:
            for line in sfile:
                sline = line.split()
                if sline:
                    wavel += [sline[0]]
                    ref += [sline[1]]

        ax = plt.subplot(gs[i%100])
        ax.scatter(wavel, ref, marker='.', s=5, edgecolors='none', color='black')
        plt.text(1.0, 0.5, name, size=10, fontdict=font_style)
        ax.set_ylim(0.3, 2.5)
        ax.set_xlim(0.2, 3)
        plt.setp(ax.xaxis.get_majorticklabels(), rotation=270)
        #ax.set_frame_on(False)

        ax.spines['top'].set_visible(False)
        ax.spines['right'].set_visible(False)
        ax.spines['bottom'].set_visible(False)
        ax.spines['left'].set_visible(False)
        ax.tick_params(axis='both',
                       bottom='off', top='off', left='off', right='off',
                       labelbottom='off', labeltop='off', labelleft='off', labelright='off')

        if i%100 >= 90:
            ax.spines['bottom'].set_visible(True)
            ax.tick_params(axis='both', bottom='on', labelbottom='on')
        if i%100 < 10:
            ax.spines['top'].set_visible(True)
            ax.tick_params(axis='both',top='on', labeltop='on')

        if i % 10 == 0:
            ax.spines['left'].set_visible(True)
            ax.tick_params(axis='both', left='on', labelleft='on')
        if (i+1) % 10 == 0:
            ax.spines['right'].set_visible(True)
            ax.tick_params(axis='both', right='on', labelright='on')


        # ax.tick_params(axis='both', bottom='off', left='off')


        if (i+1) % 100 == 0:
            print('break', i/nplots)
            gs.update(left=0.1, right=0.96, top=0.97, bottom=0.06, hspace=0.055, wspace=0.055)
            #plt.show()
            pdf.savefig(f)
            f = plt.figure(figsize=(13,16))
            gs = gridspec.GridSpec(10, 10)
        if i == nplots:
            pdf.savefig(f)
            f = plt.figure(figsize=(13,16))
            gs = gridspec.GridSpec(10, 10)
