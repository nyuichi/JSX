/*
 * Copyright (c) 2012 DeNA Co., Ltd.
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to
 * deal in the Software without restriction, including without limitation the
 * rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
 * sell copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
 * IN THE SOFTWARE.
 */

var Class = require("./Class");
eval(Class.$import("./classdef"));
eval(Class.$import("./type"));

var DocCommentNode = exports.DocCommentNode = Class.extend({

	constructor: function () {
		this._description = "";
	},

	getDescription: function () {
		return this._description;
	},

	appendDescription: function (s) {
		s = s.trim();
		// append
		if (s != "") {
			if (this._description != "") {
				this._description += " ";
			}
			this._description += s;
		}
	}

});

var DocCommentParameter = exports.DocCommentParameter = DocCommentNode.extend({

	constructor: function (token) {
		DocCommentNode.prototype.constructor.call(this);
		this._token = token;
	},

	getToken: function () {
		return this._token;
	},

	getParamName: function () {
		return this._token.getValue();
	}

});

var DocCommentTag = exports.DocCommentTag = DocCommentNode.extend({

	constructor: function (tagName) {
		DocCommentNode.prototype.constructor.call(this);
		this._tagName = tagName;
	},

	getTagName: function () {
		return this._tagName;
	}

});

var DocComment = exports.DocComment = DocCommentNode.extend({

	constructor: function () {
		DocCommentNode.prototype.constructor.call(this);
		this._params = [];
		this._tags = [];
	},

	getParams: function () {
		return this._params;
	},

	getTags: function () {
		return this._tags;
	},

	getTagByName: function (tagName) {
		for (var i = 0; i < this._tags.length; ++i) {
			if (this._tags[i].getTagName() == tagName) {
				return this._tags[i];
			}
		}
		return null;
	},
	getTagsByName: function (tagName) {
		var tags = [];
		for (var i = 0; i < this._tags.length; ++i) {
			if (this._tags[i].getTagName() == tagName) {
				tags.push(this._tags[i]);
			}
		}
		return tags;
	}

});

var DocumentGenerator = exports.DocumentGenerator = Class.extend({

	constructor: function (compiler) {
		this._compiler = compiler;
		this._outputPath = null;
		this._pathFilter = null;
		this._templatePath = null;
		this._classDefToHTMLCache = []; // array of [ classDef, HTML ]
	},

	setOutputPath: function (outputPath) {
		this._outputPath = outputPath;
		return this;
	},

	setPathFilter: function (pathFilter/* : function (sourcePath : string) : boolean */) {
		this._pathFilter = pathFilter;
		return this;
	},

	setTemplatePath: function (path) {
		this._templatePath = path;
		return this;
	},

	buildDoc: function () {
		var platform = this._compiler.getPlatform();
		// CSS file is copied regardless of the template
		platform.mkpath(this._outputPath);
		platform.save(
			this._outputPath + "/style.css",
			platform.load(platform.getRoot() + "/src/doc/style.css"));
		// output each file
		this._compiler.getParsers().forEach(function (parser) {
			if (this._pathFilter(parser.getPath())) {
				var outputFile = this._outputPath + "/" + parser.getPath() + ".html";
				platform.mkpath(outputFile.replace(/\/[^/]+$/, ""));
				var html = this._buildDocOfFile(parser);
				platform.save(outputFile, html);
			}
			return true;
		}.bind(this));
	},

	_buildDocOfFile: function (parser) {
		return this._compiler.getPlatform().load(this._templatePath).replace(
			/<%JSX:(.*?)%>/g, 
			function (_unused, key) {
				switch (key) {
				case "BASE_HREF":
					// convert each component of dirname to ..
					return parser.getPath().replace(/\/[^/]+$/, "").replace(/[^/]+/g, "..");
				case "TITLE":
					return this._escape(parser.getPath());
				case "BODY":
					return this._buildBodyOfFile(parser);
				case "FOOTER":
					return this._buildFooterOfFile(parser);
				default:
					throw new Error("unknown key:" + key + " in file: " + this._templatePath);
				}
			}.bind(this));
	},

	_buildBodyOfFile: function (parser) {
		var _ = "";

_ += "<div class=\"jsxdoc\">\n";
_ += "<div class=\"file\">\n";
_ += "<h1>"; _ += (this._escape(parser.getPath())).replace(/\n$/, ""); _ += "</h1>\n";
		var docComment = parser.getDocComment();
		if (docComment) {
_ += " "; _ += (this._descriptionToHTML(docComment)).replace(/\n$/, ""); _ += "\n";
		}
_ += "</div>\n";
_ += (this._buildListOfClasses(parser)).replace(/\n$/, ""); _ += "\n";
_ += "</div>\n";

		return _;
	},

	_buildFooterOfFile: function (parser) {
		var _ = "";
		var docComment = parser.getDocComment();
		if (docComment) {
			var version = docComment.getTagByName("version");
			if (version) {
_ += "<p>This is <strong>"; _ += (this._escape(parser.getPath())).replace(/\n$/, ""); _ += " version "; _ += (this._escape(version.getDescription())).replace(/\n$/, ""); _ += "</strong>.</p>\n";
			}
			var author = docComment.getTagByName("author");
			if (author) {
				var d = author.getDescription();
				var endWithDot = (d.charAt(d.length - 1) == ".");
_ += "<p>Copyright &copy; "; _ += (this._escape(d) + (endWithDot ? "" : ".")).replace(/\n$/, ""); _ += "</p>\n";
			}
		}
_ += "<p>This document was automatically generated by <a href=\"http://jsx.github.com/\">JSX</a><br />\n";
_ += "at "; _ += (this._escape( (new Date).toString() )).replace(/\n$/, ""); _ += ".\n";
		return _;
	},

	_buildListOfClasses: function (parser) {
		var _ = "";

_ += "<div class=\"classes\">\n";

		parser.getTemplateClassDefs().forEach(function (classDef) {
_ += (this._buildDocOfClass(parser, classDef)).replace(/\n$/, ""); _ += "\n";
		}.bind(this));

		parser.getClassDefs().forEach(function (classDef) {
			if (! (classDef instanceof InstantiatedClassDefinition)) {
_ += (this._buildDocOfClass(parser, classDef)).replace(/\n$/, ""); _ += "\n";
			}
		}.bind(this));

_ += "</div>\n";

		return _;
	},
	
	_buildDocOfClass: function (parser, classDef) {
		var typeName = "class";
		if ((classDef.flags() & ClassDefinition.IS_INTERFACE) != 0) {
			typeName = "interface";
		} else if ((classDef.flags() & ClassDefinition.IS_MIXIN) != 0) {
			typeName = "mixin";
		}
		var typeArgs = classDef instanceof TemplateClassDefinition ? classDef.getTypeArguments() : [];

		var _ = "";

_ += "<div class=\"class\" id=\"class-"; _ += (this._escape(classDef.className())).replace(/\n$/, ""); _ += "\">\n";
_ += "<h2>"; _ += (this._flagsToHTML(classDef.flags()) + " " + this._escape(typeName + " " + classDef.className()) + this._formalTypeArgsToHTML(typeArgs)).replace(/\n$/, ""); _ += "</h2>\n";
_ += (this._descriptionToHTML(classDef.getDocComment())).replace(/\n$/, ""); _ += "\n";

		if (this._hasPublicProperties(classDef)) {
			classDef.forEachMemberVariable(function (varDef) {
				if (! this._isPrivate(varDef)) {
_ += "<div class=\"member property\">\n";
_ += "<h3>\n";
_ += (this._flagsToHTML(varDef.flags())).replace(/\n$/, ""); _ += " var "; _ += (varDef.name()).replace(/\n$/, ""); _ += " : "; _ += (this._typeToHTML(parser, varDef.getType())).replace(/\n$/, ""); _ += "\n";
_ += "</h3>\n";
_ += (this._descriptionToHTML(varDef.getDocComment())).replace(/\n$/, ""); _ += "\n";
_ += "</div>\n";
				}
				return true;
			}.bind(this));
		}

		classDef.forEachMemberFunction(function (funcDef) {
			if (! (funcDef instanceof InstantiatedMemberFunctionDefinition) && this._isConstructor(funcDef) && (funcDef.flags() & ClassDefinition.IS_DELETE) == 0) {
_ += (this._buildDocOfFunction(parser, funcDef)).replace(/\n$/, ""); _ += "\n";
			}
			return true;
		}.bind(this));

		if (this._hasPublicFunctions(classDef)) {
			classDef.forEachMemberFunction(function (funcDef) {
				if (! (funcDef instanceof InstantiatedMemberFunctionDefinition || this._isConstructor(funcDef) || this._isPrivate(funcDef))) {
_ += (this._buildDocOfFunction(parser, funcDef)).replace(/\n$/, ""); _ += "\n";
				}
				return true;
			}.bind(this));
		}

_ += "</div>\n";

		return _;
	},

	_buildDocOfFunction: function (parser, funcDef) {
		var _ = "";
		var funcName = this._isConstructor(funcDef) ? "new " + funcDef.getClassDef().className() : this._flagsToHTML(funcDef.flags()) + " function " + funcDef.name();
		var args = funcDef.getArguments();
		var argsHTML = args.map(function (arg) {
			return this._escape(arg.getName().getValue()) + " : " + this._typeToHTML(parser, arg.getType());
		}.bind(this)).join(", ");

_ += "<div class=\"member function\">\n";
_ += "<h3>\n";
_ += (this._escape(funcName) + this._formalTypeArgsToHTML(funcDef instanceof TemplateFunctionDefinition ? funcDef.getTypeArguments() : [])).replace(/\n$/, ""); _ += "("; _ += (argsHTML).replace(/\n$/, ""); _ += ")\n";
		if (! this._isConstructor(funcDef)) {
_ += " : "; _ += (this._typeToHTML(parser, funcDef.getReturnType())).replace(/\n$/, ""); _ += "\n";
		}
_ += "</h3>\n";
_ += (this._descriptionToHTML(funcDef.getDocComment())).replace(/\n$/, ""); _ += "\n";
		if (this._argsHasDocComment(funcDef)) {
_ += "<table class=\"arguments\">\n";
			args.forEach(function (arg) {
				var argName = arg.getName().getValue();
_ += "<tr>\n";
_ += "<td class=\"param-name\">"; _ += (this._escape(argName)).replace(/\n$/, ""); _ += "</td>\n";
_ += "<td class=\"param-desc\">"; _ += (this._argumentDescriptionToHTML(argName, funcDef.getDocComment())).replace(/\n$/, ""); _ += "</td>\n";
_ += "</tr>\n";
			}.bind(this));
_ += "</table>\n";

		}

_ += "</div>\n";

		return _;
	},


	_descriptionToHTML: function (docComment) {
		var _ = "";

		if (docComment != null) {
			var desc = docComment.getDescription();
_ += "<div class=\"description\">\n";
			if (desc) {
_ += (desc).replace(/\n$/, ""); _ += "\n";
			}
_ += (this._tagsToHTML(docComment)).replace(/\n$/, ""); _ += "\n";
_ += "</div>\n";
		}

		return _;
	},

	_formatTagDescription: function (d) {
		if (d.match(/^https?:\/\//)) {
			return '<a href="' + this._escape(d) + '">' + this._escape(d) + '</a>';
		}
		return d;
	},

	_tagsToHTML: function (docComment) {
		var _ = "";

		["since", "see"].forEach(function (tagName) {
			var tags = docComment.getTagsByName(tagName);
			if (tags.length == 0) {
				return;
			}
_ += "<div class=\""; _ += (tagName).replace(/\n$/, ""); _ += "\">\n";
			if (tags.length == 1) {
_ += "<p>"; _ += (tagName).replace(/\n$/, ""); _ += ": <em>"; _ += (this._formatTagDescription(tags[0].getDescription())).replace(/\n$/, ""); _ += "</em></p>\n";
			}
			else {
_ += "<p>"; _ += (tagName).replace(/\n$/, ""); _ += ":</p>\n";
_ += "<ul>\n";
				tags.forEach(function (tag) {
_ += "<li>"; _ += (this._formatTagDescription(tag.getDescription())).replace(/\n$/, ""); _ += "</li>\n";
				}.bind(this));
_ += "</ul>\n";
			}
_ += "</div>\n";
		}.bind(this));
		return _;
	},

	_argumentDescriptionToHTML: function (name, docComment) {
		return docComment != null ? this._getDescriptionOfNamedArgument(docComment, name): "";
	},

	_formalTypeArgsToHTML: function (typeArgs) {
		if (typeArgs.length == 0) {
			return "";
		}
		return ".&lt;"
			+ typeArgs.map(function (typeArg) { return this._escape(typeArg.getValue()); }.bind(this)).join(", ")
			+ "&gt;";
	},

	_typeToHTML: function (parser, type) {
		// TODO create links for object types
		if (type instanceof ObjectType) {
			var classDef = type.getClassDef();
			if (classDef != null) {
				return this._classDefToHTML(parser, classDef);
			} else if (type instanceof ParsedObjectType && type.getTypeArguments().length != 0) {
				classDef = type.getQualifiedName().getTemplateClass(parser);
				if (classDef != null) {
					return this._classDefToHTML(parser, classDef)
						+ ".&lt;"
						+ type.getTypeArguments().map(function (type) { return this._typeToHTML(parser, type); }.bind(this)).join(", ")
						+ "&gt;";
				}
			}
		} else if (type instanceof FunctionType) {
			return "function "
				+ "("
				+ type.getArgumentTypes().map(function (type) {
					return ":" + this._typeToHTML(parser, type);
				}.bind(this)).join(", ")
				+ ") : " + this._typeToHTML(parser, type.getReturnType());
		} else if (type instanceof VariableLengthArgumentType) {
			return "..." + this._typeToHTML(parser, type.getBaseType());
		}
		return this._escape(type.toString());
	},

	_classDefToHTML: function (parser, classDef) {
		// instantiated classes should be handled separately
		if (classDef instanceof InstantiatedClassDefinition) {
			return this._classDefToHTML(parser, classDef.getTemplateClass())
				+ ".&lt;"
				+ classDef.getTypeArguments().map(function (type) { return this._typeToHTML(parser, type); }.bind(this)).join(", ")
				+ "&gt;";
		}
		// lokup the cache
		for (var cacheIndex = 0; cacheIndex < this._classDefToHTMLCache.length; ++cacheIndex) {
			if (this._classDefToHTMLCache[cacheIndex][0] == classDef) {
				return this._classDefToHTMLCache[cacheIndex][1];
			}
		}
		// determine the parser to which the classDef belongs
		var parserOfClassDef = function () {
			var parsers = this._compiler.getParsers();
			for (var i = 0; i < parsers.length; ++i) {
				if (parsers[i].getClassDefs().indexOf(classDef) != -1
					|| parsers[i].getTemplateClassDefs().indexOf(classDef) != -1) {
					return parsers[i];
				}
			}
			throw new Error("could not determine the parser to which the class belongs:" + classDef.className());
		}.call(this);
		// return text if we cannot linkify the class name
		if (! this._pathFilter(parserOfClassDef.getPath())) {
			return this._escape(classDef.className());
		}
		// linkify and return
		var _ = "";
_ += "<a href=\""; _ += (this._escape(parserOfClassDef.getPath())).replace(/\n$/, ""); _ += ".html#class-"; _ += (this._escape(classDef.className())).replace(/\n$/, ""); _ += "\">"; _ += (this._escape(classDef.className())).replace(/\n$/, ""); _ += "</a>\n";
		_ = _.trim();
		this._classDefToHTMLCache.push([classDef, _]);
		return _;
	},

	_flagsToHTML: function (flags) {
		var strs = [];
		// does not expose internal properties
		if ((flags & ClassDefinition.IS_STATIC) != 0)
			strs.push("static");
		if ((flags & ClassDefinition.IS_CONST) != 0)
			strs.push("const");
		if ((flags & ClassDefinition.IS_ABSTRACT) != 0)
			strs.push("abstract");
		if ((flags & ClassDefinition.IS_FINAL) != 0)
			strs.push("final");
		if ((flags & ClassDefinition.IS_OVERRIDE) != 0)
			strs.push("override");
		if ((flags & ClassDefinition.IS_INLINE) != 0)
			strs.push("inline");
		return strs.join(" ");
	},

	_escape: function (str) {
		return str.replace(/[<>&'"]/g, function (ch) {
			return {
				"<": "&lt;",
				">": "&gt;",
				"&": "&amp;",
				"'": "&#39;",
				"\"": "&quot;"
			}[ch];
		});
	},

	_hasPublicProperties: function (classDef) {
		return ! classDef.forEachMemberVariable(function (varDef) {
			if (! this._isPrivate(varDef)) {
				return false;
			}
			return true;
		}.bind(this));
	},

	_hasPublicFunctions: function (classDef) {
		return ! classDef.forEachMemberFunction(function (funcDef) {
			if (funcDef instanceof InstantiatedMemberFunctionDefinition
				|| this._isConstructor(funcDef)
				|| this._isPrivate(funcDef)) {
				return true;
			}
			return false;
		}.bind(this));
	},

	_argsHasDocComment: function (funcDef) {
		var docComment = funcDef.getDocComment();
		if (docComment == null) {
			return false;
		}
		var args = funcDef.getArguments();
		for (var argIndex = 0; argIndex < args.length; ++argIndex) {
			if (this._getDescriptionOfNamedArgument(docComment, args[argIndex].getName().getValue()) != "") {
				return true;
			}
		}
		return false;
	},

	_getDescriptionOfNamedArgument: function (docComment, argName) {
		var params = docComment.getParams();
		for (var paramIndex = 0; paramIndex < params.length; ++paramIndex) {
			if (params[paramIndex].getParamName() == argName) {
				return params[paramIndex].getDescription();
			}
		}
		return "";
	},

	_isConstructor: function (funcDef) {
		return funcDef.name() == "constructor"
			&& (funcDef.flags() & ClassDefinition.IS_STATIC) == 0;
	},

	_isPrivate: function (memberDef) {
		return memberDef.name().charAt(0) == "_";
	}

});
