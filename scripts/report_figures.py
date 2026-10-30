"""Recreate report assets from frozen results: python -m pip install matplotlib."""
import json
from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np
ROOT = Path(__file__).resolve().parents[1]
report = json.loads((ROOT/'public/research/analysis.json').read_text())
OUT=ROOT/'public/research/figures'; OUT.mkdir(parents=True,exist_ok=True)
plt.rcParams.update({'font.size':9,'axes.spines.top':False,'axes.spines.right':False,'svg.fonttype':'none','figure.facecolor':'white','axes.grid':True,'grid.alpha':.18})
labels=['Nearest','Random','Rule','RL full','RL no-info','Untrained']
strategies=['nearest','random','rule','trained','no-departure','untrained']
colors=['#8e9d92','#b3b991','#b09b73','#368465','#9986b6','#b6bcc4']
def save(fig,name):
    for ext in ['png','svg']: fig.savefig(OUT/f'{name}.{ext}',dpi=300,bbox_inches='tight')
    plt.close(fig)
for family,kind,count in [('standard','cinema',70),('airport','ground',180),('asymmetric','cinema',70)]:
    selected=[r for r in report['summaries'] if r['family']==family and r['kind']==kind and r['count']==count and r['noise']==6]
    rows=[next(r for r in selected if r['strategy']==s) for s in strategies]
    fig,axes=plt.subplots(1,2,figsize=(10,3.5),layout='constrained')
    for ax,metric,title in zip(axes,['rejectionRate','operatingPerVehicle'],['Rejected vehicles (%)','Operating cost / input vehicle (ticks)']):
        ax.bar(range(6),[r['metrics'][metric]['mean'] for r in rows],yerr=[r['metrics'][metric]['trafficStd'] for r in rows],color=colors,capsize=3,width=.65)
        ax.set_xticks(range(6),labels,rotation=25,ha='right'); ax.set_ylabel(title);ax.set_ylim(bottom=0)
    fig.suptitle(f'{family} / {kind} / demand {count} / forecast noise ±6 ticks\n30 traffic seeds; 3 learning seeds; error bars: traffic SD after learner averaging',fontsize=10)
    save(fig,f'{family}-summary')
    logs=[json.loads((ROOT/'public'/e['logUrl']).read_text()) for e in report['manifest']['entries'] if e['family']==family]
    fig,axes=plt.subplots(1,3,figsize=(11,3.4),layout='constrained')
    for ax,metric,title in zip(axes,['validationRejectionRate','validationOperatingPerVehicle','loss'],['Validation rejection (%)','Validation operating cost / input','Training Huber loss']):
        for log in logs:
            rows=[r for r in log['history'] if metric in r]
            ax.plot([r['episode'] for r in rows],[r[metric] for r in rows],color='#368465' if log['featureMode']=='full' else '#9986b6',linestyle='-' if log['featureMode']=='full' else '--',alpha=.65,label=f"{log['featureMode']} / {log['seed']}")
        ax.set_xlabel('Episode');ax.set_ylabel(title)
    axes[-1].legend(fontsize=6,loc='upper right');fig.suptitle(f'{family}: all 6 learning runs; checkpoints selected only on validation',fontsize=10)
    save(fig,f'{family}-learning')
    fig,axes=plt.subplots(1,2,figsize=(9,3.8),layout='constrained')
    demands=report['manifest']['demandLevels'][family]; noises=report['manifest']['noiseLevels']
    for ax,metric,title in zip(axes,['rejectionRate','operatingPerVehicle'],['RL − Nearest rejection (%p)','RL − Nearest operating cost / input']):
        grid=np.array([[next(r for r in report['summaries'] if r['family']==family and r['kind']==kind and r['count']==d and r['noise']==n and r['strategy']=='trained')['pairedVsNearest'][metric]['mean'] for n in noises] for d in demands])
        extent=max(.001,abs(grid).max());im=ax.imshow(grid,cmap='BrBG_r',vmin=-extent,vmax=extent);ax.grid(False)
        ax.set_xticks(range(3),[f'±{n}' for n in noises]);ax.set_yticks(range(3),demands);ax.set_xlabel('Forecast noise (ticks)');ax.set_ylabel('Input vehicles');ax.set_title(title,fontsize=9)
        for i in range(3):
            for j in range(3): ax.text(j,i,f'{grid[i,j]:.3f}',ha='center',va='center',fontsize=10,bbox={'facecolor':'white','alpha':.7,'edgecolor':'none','pad':2})
        fig.colorbar(im,ax=ax,shrink=.7)
    fig.suptitle(f'{family} / {kind}: paired sensitivity (negative favors RL); compare service first',fontsize=10)
    save(fig,f'{family}-sensitivity')
print(f'Wrote 9 PNG and 9 SVG figures to {OUT}')
