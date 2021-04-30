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
// Deduplicate evaluation: build/extend reference data
// Index new urls and add to the ref database
// input file in csv format docid,url

load('inc/config.js');
load('coll/utility.js');
load('inc/json.js');

var DEDUP_EVAL_DBNAME = TMP_DBNAME;
var AMI_BIN = getenv("ALBERT") != '' ? getenv("ALBERT")+"/bin/" : "/opt/albert/bin/";

// global variables
var dbname = DEDUP_EVAL_DBNAME;
var ref_file = false;
var col_file = false;
var rules_file = false;
var outdir = "data";
var idx = false;
var clear = true;
var verbose = false;

// usage
function usage(message) {
    if (message != undefined)
        print("Error: " + message);
    print("./albScript -f buildref.js +h +b dbname +r ref_urls_file +c col_urls_file +u rules_file +o outdir");
    print("\t +h : show help");
    print("\t +b dbname : ref database name (defaults to TMP_DBNAME config content)");
    print("\t +r ref_urls_file : reference urls file (line format: id,url)");
    print("\t +c col_urls_file : collect urls file (line format: id,url)");
    print("\t +u rules_file : rules file (json format");
    print("\t +o outdir : where to put reference data");
    print("");
    quit(0);
}

function parseArguments(args) {
    if (args.length <= 1) usage();
    for (var i=1; i<args.length; i++) {
        if (args[i] == "+h") usage();
        if (args[i] == "+b") {
            i++;
            if (i == args.length) usage("No dbname is given.");
            dbname = args[i]; continue;
        }
        if (args[i] == "+r") {
            i++;
            if (i == args.length) usage("No reference urls file is given.");
            ref_file = args[i]; continue;
        }
        if (args[i] == "+c") {
            i++;
            if (i == args.length) usage("No collect urls file is given.");
            col_file = args[i]; continue;
        }
        if (args[i] == "+u") {
            i++;
            if (i == args.length) usage("No rules file is given.");
            rules_file = args[i]; continue;
        }
        if (args[i] == "+o") {
            i++;
            if (i == args.length) usage("No output dir name is given.");
            outdir = args[i]; continue;
        }
        usage("Unknown parameter");
    }    
}

function storeUrl(docid, url) {
    //var doc = new amiDocument(url);
    var doc = getDocumentRedirect(url);
    if (!doc || Number(doc.errorCode) != 200) {
        print("\nWARNING: document not stored [" + url + "]");
        print("\t\tIGNORE ref. document [" + docid + "]");
        return false;
    }
    doc.setField("article", docid);
    if (!idx) {
        idx = new amiIndexer;
        idx.dbname = dbname;
        if (clear) {
            print("Clearing database : " + dbname);
            idx.job('<indexer.clearbase><dbname>'+dbname+'</dbname></indexer.clearbase>');
        }
        // import previous data is any
        var ref_data = outdir  + "/data.ref.xml";
        var ref_data_file = new File(ref_data);
        if (ref_data_file.exists) {
            // import data
            print("Importing previous ref data from : " + ref_data);
            var res = system("\"" + AMI_BIN + "albToolkit\" -b " +  dbname + " import -f " + ref_data);
            if (res != 0) usage("Error in import command");
        }
    }
    if (verbose) print("Storing reference url : " + url);
    if (!idx.store(doc, "article=" + docid + ",ami:xurl=" +  url)) {
        print("\nWARNING: document not stored [" + url + "]");
        print("\t\tIGNORE ref. document [" + docid + "]");
    }
}

function collectUrl(docid, url) {
    //var doc = new amiDocument(url);
    var doc = getDocumentRedirect(url);
    if (!doc || Number(doc.errorCode) != 200) return false;
    doc.setField("id", docid);
    return doc;
}

// parse arguments
parseArguments(arguments);
if (!ref_file && !col_file) usage("No ref/col inputfile is given");

// process ref urls content
if (ref_file) {
    var myfile = new File(ref_file);
    myfile.open("read=yes");
    if (!myfile)
        usage("Unable to open file [" + ref_file + "]");
    var urls = myfile.readAll();
    myfile.close();
    for (var u=0; u<urls.length; u++) {
        var tmp = urls[u].split(",");
        if (tmp.length < 2)
            tmp = urls[u].split(";");
        if (tmp.length < 2) continue;
        var docid = tmp[0];
        var url = tmp[1];
        storeUrl(docid, url);
    }
    // export data to file
    var ref_data = outdir  + "/data.ref.xml";
    var ref_data_file = new File(ref_data);
    if (ref_data_file.exists && !ref_data_file.remove())
        usage('Cannot remove file [' + ref_data  + ']');
    var data = idx.job('<indexer.data><dbname>'+dbname+'</dbname></indexer.data>');
    ref_data_file.open("create=yes,write=yes");
    ref_data_file.write(utf8_encode(data));
    ref_data_file.close();
}

// process col urls content
if (col_file) {
    var myfile = new File(col_file);
    myfile.open("read=yes");
    if (!myfile)
        usage("Unable to open file [" + col_file + "]");
    var urls = myfile.readAll();
    myfile.close();
    var docs = [];
    for (var u=0; u<urls.length; u++) {
        var tmp = urls[u].split(",");
        if (tmp.length < 2)
            tmp = urls[u].split(";");
        if (tmp.length < 2) continue;
        var docid = tmp[0];
        var url = tmp[1];
        if (verbose) print("Processing collect url : " + url);
        var doc = collectUrl(docid, url);
        if (doc) docs.push(doc);
        else {
            print("\nWARNING: document not stored [" + url + "]");
            print("\t\tIGNORE col. document [" + docid + "]");
        }
    }

    if (docs.length) {
        // get previous docs if any
        var col_data = outdir  + "/data.col.xml";
        var col_data_file = new File(col_data);
        if (col_data_file.exists) {
            // import data
            print("Getting previous col data from : " + col_data);
            var col_xdata = new aXMLDocument(col_data);
            if (!col_xdata) usage("No valid XML data in " + col_data);
            var xdoc = col_xdata.find("document");
            while (xdoc) {
                var xadoc = xdoc.find("ami:document");
                if (xadoc) {
                    var one_doc = new amiDocument(xadoc);
                    if (one_doc) docs.push(one_doc);
                }
                xdoc = xdoc.next;
            }
        }
        // build final collect xml data
        var xfinal = new aXMLDocument();
        var x = xfinal.addNode("ami:mi_results");
        x.SetAttribute("xmlns:ami", "http://xml.albert.com/xmlns/AMI");
        var r = x.addNode("results");
        r.addNode("title", "Evaluate deduplicate script");
        r.addNode("count", docs.length);
        var s = x.addNode("subject");
        s.addNode("label", "Subject to evaluate deduplicate script");
        var ds = s.addNode("documents");
        for (var d=0; d<docs.length; d++) {
            var onedoc = ds.addNode("document");
            onedoc.addNode("url", docs[d].getField("ami:url"));
            onedoc.addNode("title", docs[d].title);
            onedoc.addNode("summary", docs[d].summary);
            onedoc.addNode("author", docs[d].author);
            onedoc.addNode("server",  docs[d].server);
            onedoc.addNode("type",  docs[d].type);
            onedoc.addNode(docs[d].xml);
        }
        // save into file
        if (col_data_file.exists && !col_data_file.remove())
            usage('Cannot remove file [' + col_data  + ']');
        col_data_file.open("create=yes,write=yes");
        col_data_file.write(utf8_encode(xfinal.source));
        col_data_file.close();
    }    
}

// process rules file if any
if (rules_file) {

    // get previous docs if any
    var rules = false;
    var rules_data = outdir  + "/rules.json";
    var rules_data_file = new File(rules_data);
    if (rules_data_file.exists) {
        // import data
        print("Getting previous rules data from : " + rules_data);
        rules_data_file.open("read=yes");
        if (!rules_data_file) usage("Unable to open file [" + rules_data + "]");
        var rules = rules_data_file.read(rules_data_file.size);
        rules_data_file.close();
        if (rules) rules = json_decode(utf8_decode(rules));
        if (!rules || !rules.docs)
            this.usage("Unable to get valid data from file [" + rules_data + "]");
    }
    
    // new file
    var new_rules_file = new File(rules_file);
    new_rules_file.open("read=yes");
    if (!new_rules_file) usage("Unable to open file [" + rules_file + "]");
    var new_rules = new_rules_file.read(new_rules_file.size);
    new_rules_file.close();
    if (new_rules) new_rules = json_decode(utf8_decode(new_rules));
    if (!new_rules || !new_rules.docs)
        usage("Unable to get valid data from file [" + rules_file + "]");
 
    // merge
    if (!rules) rules = new_rules;
    else {
        for (var r=0; r<new_rules.docs.length; r++) {
            if (new_rules.docs[r].id == undefined) continue;
            rules.docs.push(new_rules.docs[r]);
        }
    }

    // save rules
    if (rules_data_file.exists && !rules_data_file.remove())
        usage('Cannot remove file [' + rules_data  + ']');
    rules_data_file.open("create=yes,write=yes");
    rules_data_file.write(utf8_encode(JSON.stringify(rules, null, " ")));
    rules_data_file.close();
}