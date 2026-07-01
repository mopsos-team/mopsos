#!/usr/bin/env python3
"""Re-parse hypotactic.com scansion HTML (od_N.html) into the homer_lines.csv /
homer_words.csv schema, and patch the corrected rows in. Used to fix Odyssey
Books 1 and 6, whose original scrape was a duplicate of Books 10 and 9.

Each <span class="syll long|short"> gives a syllable quantity; feet are derived
by the standard greedy hexameter parse (L+SS=dactyl, L+L=spondee, 6 feet).
Run from the repo root: python3 scripts/parse_hypotactic.py"""
import csv, re, sys, unicodedata
from html.parser import HTMLParser
from pathlib import Path

class Hypotactic(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.lines=[]; self.cur=None; self.word=None; self.syll=None
        self.cap=False; self.stack=[]
    def handle_starttag(self, tag, attrs):
        a=dict(attrs); cls=a.get("class","")
        if tag=="div" and "line hexameter" in cls:
            if self.cur: self.lines.append(self.cur)
            self.cur={"num":a.get("data-number"),"id":a.get("id"),"words":[]}
        elif tag=="span":
            parts=cls.split()
            if cls=="word" or parts==["word"]:
                self.word=[]; self.stack.append("word")
            elif "syll" in parts:
                self.syll={"t":"","q":"L" if "long" in parts else "S"}; self.cap=True; self.stack.append("syll")
            else:
                self.stack.append("other")
    def handle_data(self, data):
        if self.cap and self.syll is not None: self.syll["t"]+=data
    def handle_endtag(self, tag):
        if tag=="span" and self.stack:
            top=self.stack.pop()
            if top=="syll":
                if self.word is not None and self.syll: self.word.append((self.syll["t"], self.syll["q"]))
                self.syll=None; self.cap=False
            elif top=="word":
                if self.cur is not None and self.word is not None: self.cur["words"].append(self.word)
                self.word=None
    def close(self):
        super().close()
        if self.cur: self.lines.append(self.cur)

def parse_feet(Q):
    feet=[]; sfoot=[]; i=0; f=0; n=len(Q)
    while i<n:
        f+=1
        if f<6:
            if Q[i]=="L" and i+2<n and Q[i+1]=="S" and Q[i+2]=="S":
                feet.append("LSS"); sfoot+=[f,f,f]; i+=3
            elif Q[i]=="L" and i+1<n and Q[i+1]=="L":
                feet.append("LL"); sfoot+=[f,f]; i+=2
            else:
                return None,None   # not a clean hexameter by greedy parse
        else:
            feet.append("".join(Q[i:])); sfoot+=[f]*(n-i); i=n
    return ("|".join(feet), sfoot) if len(feet)==6 else (None,None)

def hemi(foot, pos_in_foot):
    return 1 if (foot<3 or (foot==3 and pos_in_foot==0)) else 2

LINE_FIELDS=["work","book","file_name","relative_path","title","line_order_in_file","line_num","line_id",
 "line_classes","extra_line_classes","is_newpara","is_speech","speaker_or_extra_labels","n_syllables",
 "n_words","line_text","feet_pattern","speed_by_order","speed_by_line_num"]
WORD_FIELDS=["work","book","file_name","relative_path","line_order_in_file","line_num","line_id","word_idx",
 "word_text","n_syllables_in_word","start_syll_order","end_syll_order","start_foot","end_foot",
 "start_hemi","end_hemi","contains_footend","all_quantities"]

def build(path, book):
    fn=f"od_{book}.html"; rel=f"odyssey/{fn}"
    p=Hypotactic(); p.feed(Path(path).read_text(encoding="utf-8")); p.close()
    lrows=[]; wrows=[]; skipped=0
    for order,L in enumerate(p.lines,1):
        words=L["words"]
        Q=[q for w in words for (_,q) in w]
        feet, sfoot = parse_feet(Q)
        ln=L["num"]; line_num=f"{int(ln)}.0" if ln and ln.isdigit() else (ln or str(order))
        lid=L["id"] or f"line{order}"
        wtexts=[("".join(t for t,_ in w)).replace(" ","").replace("\xa0","") for w in words]
        line_text=" ".join(wtexts)
        if not feet:
            skipped+=1
            # still emit the line with empty feet so text is present
            feet="" ; sfoot=[1]*len(Q)
        lrows.append({"work":"odyssey","book":str(book),"file_name":fn,"relative_path":rel,"title":"",
            "line_order_in_file":order,"line_num":line_num,"line_id":lid,"line_classes":"line hexameter",
            "extra_line_classes":"","is_newpara":0,"is_speech":0,"speaker_or_extra_labels":"",
            "n_syllables":len(Q),"n_words":len(words),"line_text":line_text,"feet_pattern":feet,
            "speed_by_order":"","speed_by_line_num":""})
        # word rows
        si=0
        for wi,w in enumerate(words,1):
            qs="".join(q for _,q in w); k=len(w)
            s0=si+1; s1=si+k
            f0=sfoot[si] if si<len(sfoot) else 6
            f1=sfoot[si+k-1] if si+k-1<len(sfoot) else 6
            # position in foot for first syll
            pif=0
            if si>0 and si-1<len(sfoot) and sfoot[si-1]==f0: pif=1
            wrows.append({"work":"odyssey","book":str(book),"file_name":fn,"relative_path":rel,
                "line_order_in_file":order,"line_num":line_num,"line_id":lid,"word_idx":wi,
                "word_text":wtexts[wi-1],"n_syllables_in_word":k,"start_syll_order":s0,"end_syll_order":s1,
                "start_foot":f0,"end_foot":f1,"start_hemi":hemi(f0,pif),"end_hemi":hemi(f1,1),
                "contains_footend":0,"all_quantities":qs})
            si+=k
    return lrows, wrows, skipped, len(p.lines)

allL=[]; allW=[]
for book,path in [(1,"/mnt/user-data/uploads/odyssey1.html"),(6,"/mnt/user-data/uploads/odyssey6.html")]:
    lr,wr,sk,nl=build(path,book)
    print(f"book {book}: {nl} lines parsed, {sk} with feet-parse issues, {len(wr)} words")
    print(f"   line 1: {lr[0]['line_text'][:50]}  | feet {lr[0]['feet_pattern']}")
    allL+=lr; allW+=wr

# patch homer_lines.csv and homer_words.csv: drop corrupt od 1/6, append correct
def patch(path, fields, newrows, key_books={"1","6"}):
    rows=[r for r in csv.DictReader(open(path,newline="",encoding="utf-8"))
          if not (r["work"]=="odyssey" and r["book"] in key_books)]
    rows+=newrows
    with open(path,"w",newline="",encoding="utf-8") as fh:
        w=csv.DictWriter(fh,fieldnames=fields); w.writeheader()
        for r in rows: w.writerow({k:r.get(k,"") for k in fields})
    return len(rows)

nl=patch("assets/data/scansion/homer_lines.csv", LINE_FIELDS, allL)
nw=patch("assets/data/scansion/homer_words.csv", WORD_FIELDS, allW)
print(f"\nhomer_lines.csv now {nl} rows ; homer_words.csv now {nw} rows")
