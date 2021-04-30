//=============================================================================
//                    ____            _   _         ___ _
//                   | __ )  ___ _ __| |_(_)_ __   |_ _| |_
//                   |  _ \ / _ \ '__| __| | '_ \   | || __|
//                   | |_) |  __/ |  | |_| | | | |  | || |_
//                   |____/ \___|_|   \__|_|_| |_| |___|\__|
//
// Copyright (c), 1999-2021, Bertin IT. - All Rights Reserved.
// This source code is the property of Bertin IT. Its content may not be
// disclosed to third parties, copied, used or duplicated in any form, in whole
// or in part, without the prior written consent of Bertin IT.
//=============================================================================
//
// Deduplicate evaluation: call deduplication and compare to the expected results
//

load('inc/config.js');
load("inc/amiapi.lib.js");

var DEDUP_EVAL_DBNAME = TMP_DBNAME; // "amiei_tempdb"
var DEDUP_EVAL_DATASOURCE = TMP_DATASOURCE; // "AMI_Temp"
var DEDUP_CHUNK_SIZE = 10;

var verbose = false;
DeDupEval = function DeDupEval() {
    this.Ami_Api = new AMIApi();
    this.dbname = DEDUP_EVAL_DBNAME;
    this.col_file = false;
    this.rules_file = false;
    this.ds = DEDUP_EVAL_DATASOURCE;
    this.result = {};
    this.docid = false;
}

// usage
DeDupEval.prototype.usage = function (message) {
    if (message != undefined)
        print("Error: " + message);
    print("./albScript -f evaluate.js +h +b dbname +c collect_file +r rules_files +i docid");
    print("\t +h : show help");
    print("\t +v : verbose mode");
    print("\t +b dbname : ref database name (defaults to TMP_DBNAME config content)");
    print("\t +c collect_file : collect log like format file (documents to deduplicate)");
    print("\t +r rules_file : rules file with the expected results");
    print("\t +i docid : one given docid to test");
    print("");
    quit(0);
}

// parse arguments
DeDupEval.prototype.parseArguments = function (args) {
    if (args.length <= 1) this.usage();
    for (var i=1; i<args.length; i++) {
        if (args[i] == "+h") this.usage();
        if (args[i] == "+v") {
            verbose = true;
            continue;
        }
        if (args[i] == "+b") {
            i++;
            if (i == args.length) this.usage("No dbname is given.");
            this.dbname = args[i]; continue;
        }
        if (args[i] == "+c") {
            i++;
            if (i == args.length) this.usage("No collect file is given.");
            this.col_file = args[i]; continue;
        }
        if (args[i] == "+r") {
            i++;
            if (i == args.length) this.usage("No rules file is given.");
            this.rules_file = args[i]; continue;
        }
        if (args[i] == "+i") {
            i++;
            if (i == args.length) this.usage("No docid is given.");
            this.docid = args[i]; continue;
        }
        this.usage("Unknown parameter");
    }    
}

// get SN sorted sorted by similarity to title
DeDupEval.prototype.getSortedSN = function (doc) {
    if (!doc.content.length || !doc.title.length
        || doc.qbSummaryTitle == undefined) return false;
    setConfig("QBS.title_size", "5000");
    setConfig("QBS.title_mode", "B0");
    var qbst = doc.qbSummaryTitle(doc.title, true);
    if (typeof(qbst)!="array" && typeof(qbst)!="object")
        return false;
    var snSorted = qbst[1];
    return snSorted;
}

// get duplicates
DeDupEval.prototype.getDuplicates = function (docs) {
    var duplicates = [];
    var apiDocs = [];
    //var verbose = true;
    var params = { 'verbose' : true, 'dbname' : this.dbname, 
                    'ds' : this.ds, 'age' : 0, 'test' : 1 };
    for (var d=0; d<docs.length; d++) {
        var doc = docs[d];
        var snSorted = this.getSortedSN(docs[d]);
        var apiDoc = {
            url: doc.url,
            title: doc.title,
            summary: doc.summary,
            sn: doc.getField('ami:sn'),
            //size: doc.getField('ami:size')
            size: utf8_encode(doc.content).length
        };
        if (snSorted) apiDoc.coresn = snSorted;
        apiDocs.push(apiDoc);
        if (apiDocs.length == DEDUP_CHUNK_SIZE) {
            if (verbose) print("INPUT: " + JSON.stringify(apiDocs, null, " "));
            var apiResult = this.Ami_Api.GetDuplicates(apiDocs, params);
            if (verbose) print("OUTPUT: " + JSON.stringify(apiResult, null, " "));
            duplicates = duplicates.concat(apiResult);
            apiDocs = [];
        }
    }
    if (apiDocs.length > 0) {
        if (verbose) print("INPUT: " + JSON.stringify(apiDocs, null, " "));
        var apiResult = this.Ami_Api.GetDuplicates(apiDocs, params);
        if (verbose) print("OUTPUT: " + JSON.stringify(apiResult, null, " "));
        duplicates = duplicates.concat(apiResult);
    }
    return duplicates;
}

// process
DeDupEval.prototype.process = function (args) {

    this.parseArguments(args);
    if (!this.col_file || !this.rules_file) this.usage("No collect or/and rules file(s) is/are given");

    // get collect data
    var col_data = new aXMLDocument(this.col_file);
    if (!col_data) this.usage("No valid XML data in " + this.col_file);
    var docs = [];
    var xdoc = col_data.find("document");
    var num = 0;
    while (xdoc) {
        var tag = xdoc.find("ami:document");
        if (tag) {
            var doc = new amiDocument(tag);
            if (doc) {
                // focus on one doc?
                if (this.docid) {
                    var id = doc.getField("id");
                    if (id == this.docid) { docs.push(doc); break; }
                    else { xdoc = xdoc.next; continue; }
                }
                docs.push(doc);
            }
            num++;
            //if (num == 2) break;
        }
        xdoc = xdoc.next;
    }
    if (docs.length == 0) this.usage("No collect docs to process.");
    var now = new Date();
    var start_time = now.getTime();
    var dups = this.getDuplicates(docs);
    now = new Date();
    var duration_s = (now.getTime() - start_time)/1000;
    var duration_by_doc = duration_s / docs.length;
    if (!dups) {
        this.result = {
            "totaldocs" : docs.length,
            "score" : 0.0,
            "duration" : duration_s.toFixed(2) + "s",
            "duration_by_doc" : duration_by_doc.toFixed(2) + "s",
         };
        return 0.0;
    }
    // compare to expected results
    var rules_f = new File(this.rules_file);
    rules_f.open("read=yes");
    if (!rules_f) this.usage("Unable to open file [" + this.rules_file + "]");
    var rules = rules_f.read(rules_f.size);
    rules_f.close();
    if (rules) rules = json_decode(utf8_decode(rules));
    if (!rules || !rules.docs)
        this.usage("Unable to get valid data from file [" + this.rules_file + "]");
    rules = rules.docs;
    // rules format
    // { "id" : "01", "pure" : "", "mirror" : "A", "similar" : "" },
    var a_rules = {};
    for (var r=0; r<rules.length; r++) {
        if (rules[r].id == undefined) continue;
        var id = rules[r].id;
        a_rules[id] = r;
    }
    var cats = ["mirror", "pure", "similar"];
    var tp = {}, fp = {}, fn = {};
    var avg_p = {}, avg_r = {}, avg_fs = {};
    for (var c in cats) {
        var cat = cats[c];
        tp[cat] = 0; fp[cat] = 0; fn[cat] = 0;
        avg_p[cat] = 0; avg_r[cat] = 0; avg_fs[cat] = 0;
    }

    var docs_eval = [];
    var total = 0;
    for (var d=0; d<docs.length; d++) {
        var id = docs[d].getField("id");
        //print ("Processing document d: " + d + ", id " + id);
        if (!id) continue;
        if (a_rules[id] == undefined) continue;
        total++;
        var doc_eval = { "id" : id };
        var pred = dups[d]; // {"pure":[],"mirror":[],"similar":[{"id":"A","weigth":"84"}]}
        var ref = rules[a_rules[id]]; // {"id" : "01", "mirror" : "A"}
        // compare pred and ref
        //print("Predicted"); print(JSON.stringify(pred));
        //print("Reference"); print(JSON.stringify(ref));
        var avg_p_doc = 0, avg_r_doc = 0, avg_fs_doc = 0;
        for (var c in cats) {
            var cat = cats[c];
            var doc_tp = 0, doc_fp = 0, doc_fn = 0;
            var pred_set = {}, ref_set = {};
            var pred_num = 0, ref_num = 0;
            if (pred[cat] != undefined) {
                for (var i in pred[cat]) {
                    var id = pred[cat][i]["id"];
                    pred_set[id] = 1;
                    pred_num++;
                }
            }
            if (ref[cat] != undefined) {
                var tmp = ref[cat].split(",");
                for (var i in tmp) {
                    var id = tmp[i];
                    ref_set[id] = 1;
                    ref_num++;
                }
            }
            //print("Cat : " + cat);
            //print("Predicted Set"); print(JSON.stringify(pred_set, null, " "));
            //print("Reference Set"); print(JSON.stringify(ref_set, null, " "));
            if (pred_num == 0 && ref_num == 0) {
                doc_eval[cat] = {
                    "p" : "1.00", 
                    "r" : "1.00",
                    "fs" : "1.00"
                };
                avg_p_doc += 1.0; avg_r_doc += 1.0; avg_fs_doc += 1.0;
                avg_p[cat] += 1.0; avg_r[cat] += 1.0; avg_fs[cat] += 1.0;
                continue;
            }
                // compare
            for (var id in pred_set) {
                if (ref_set[id] != undefined) { doc_tp++; continue; }
                doc_fp++;
            }
            for (var id in ref_set) {
                if (pred_set[id] != undefined) continue;
                doc_fn++;
            }
            tp[cat] += doc_tp; fp[cat] += doc_fp; fn[cat] += doc_fn;
            // precision, recall, fscore by doc
            var p_doc = 0.0, r_doc = 0.0, fs_doc = 0.0;
            if (doc_tp>0 || doc_fp>0) p_doc = 1.0*doc_tp/(doc_tp+doc_fp);
            if (doc_tp>0 || doc_fn>0) r_doc = 1.0*doc_tp/(doc_tp+doc_fn);
            if (p_doc>0 || r_doc>0) fs_doc = 2*p_doc*r_doc/(p_doc+r_doc);
            doc_eval[cat] = {
                "p" : p_doc.toFixed(2), 
                "r" : r_doc.toFixed(2),
                "fs" : fs_doc.toFixed(2)
            };
            avg_p_doc += p_doc; avg_r_doc += r_doc; avg_fs_doc += fs_doc;
            avg_p[cat] += p_doc; avg_r[cat] += r_doc; avg_fs[cat] += fs_doc;

        }
        // average scores
        avg_p_doc /= 3; avg_r_doc /= 3; avg_fs_doc /= 3;
        doc_eval["average"] = {
            "p" : avg_p_doc.toFixed(2), 
            "r" : avg_r_doc.toFixed(2),
            "fs" : avg_fs_doc.toFixed(2)
        };
        docs_eval.push(doc_eval);
    }

    var summary = {};
    var p = 0, r = 0, fs = 0;
    for (var c in cats) {
        var cat = cats[c];
        if (total > 0) {
            avg_p[cat] /= total;
            avg_r[cat] /= total;
            avg_fs[cat] /= total;
            p += avg_p[cat];
            r += avg_r[cat];
            fs += avg_fs[cat];
        }
        summary[cat] = {
            "p" : avg_p[cat].toFixed(2), 
            "r" : avg_r[cat].toFixed(2),
            "fs" : avg_fs[cat].toFixed(2)
        };
    }
    p /= 3, r /= 3, fs /= 3;
    summary["average"] =  {
        "p" : p.toFixed(2), 
        "r" : r.toFixed(2),
        "fs" : fs.toFixed(2)
    };
    this.result =  {};
    this.result["totaldocs"] = docs.length;
    this.result["score"] = fs.toFixed(2);
    this.result["duration"] = duration_s.toFixed(2) + "s";
    this.result["duration_by_doc"] = duration_by_doc.toFixed(2) + "s";
    this.result["summary"] = summary;
    this.result["docs"] = docs_eval;
    return fs;
}

var arguments;
if ((arguments != undefined) && arguments[0].match("evaluate.js")) {
    var eval = new DeDupEval();
    var average_fs = eval.process(arguments);
    print(JSON.stringify(eval.result, null, " "));
    //print("Total average fscore value is : " + average_fs.toFixed(2));
}

