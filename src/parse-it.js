let l = 0
let debug = true
const X = function(){
	if(debug)
		console.log(' | '.repeat(l || 0), ...arguments)
}

Object.isPlainObject = function(object){
	return Object.getPrototypeOf(object) === Object.prototype
}
Array.prototype.sortByMap = function(map){
	return this.sort((a, b) => map(a) - map(b))
}

const input =
	//'1'
	//'abcd'
	//'1+2=3'
	//'sin(3)'
	//'12'
	//'12345'
	'1^2'
	//'(1/6)'
	//'1+(2)'
	//'1+2/3-4'
	//'1/(1^(2/3))'
	//'(1+(2+(3+(4+(5)))))'
	//'0.1+2-3/(4^56)+(7!+8%-√9)!/sin(10^(11/12A))+13BC'
	//'E=mc^2'

const grammar = {
	//*
	'EQUALITY_OPERATOR': {one: ['=', '<', '>']},// /=|<|>/,

	'FUNCTION_NAME': {one: [[...'sin'], [...'cos'], [...'tan'], [...'log']]},
	
	'EXPRESSION': {
		'FACTOR': {
			'CONSTANT': {repeat: /[\d.]/},
			'VARIABLE': /[a-zA-Zα-ωΑ-Ω∞]/,
			'FUNCTION': [{one: ['FUNCTION_NAME', 'VARIABLE']}, 'PARENTHESES'],
			'PARENTHESES': ['(', {optional: 'EXPRESSION'}, ')'],
			'ABSOLUTE_VALUE': ['|', 'EXPRESSION', '|'],
			'EXPONENT': ['EXPRESSION', '^', 'EXPRESSION'],
			'ROOT': ['√', 'EXPRESSION'],
			'FACTORIAL': ['EXPRESSION', '!'],
			'PERCENT': ['EXPRESSION', '%'],
			'TERM': ['FACTOR', {repeat: [/[* /]/, 'FACTOR']}]
		},
		//'SUMMAND': [/[+-]/, 'FACTOR'],
		'SUM': ['EXPRESSION', {repeat: [/[+-]/, 'FACTOR']}],
	},
	'EQUATION': ['EXPRESSION', {repeat: ['EQUALITY_OPERATOR', 'EXPRESSION']}],

	/*/
	// Testing
	//'SEQUENCE': ['1', '2', 'X', ['X', 'X']],
	//'X': [{optional: '1'}, '2', /3/],
	//'ONE': {one: ['a', 'b', 'c']},
	//*/
}

const namedPatterns = {}

function parsePattern(rawPattern, name, parentName){
	let type, data
	if(rawPattern instanceof Array){
		type = 'sequence'
		data = rawPattern.map(parsePattern)
	}else if(rawPattern instanceof RegExp){
		type = 'regex'
		data = rawPattern
	}else if(rawPattern instanceof Object){
		if('repeat' in rawPattern){
			type = 'repeat'
			data = parsePattern(rawPattern.repeat)
		}else if('optional' in rawPattern){
			type = 'optional'
			data = parsePattern(rawPattern.optional)
		}else if('one' in rawPattern){
			type = 'one'
			data = (rawPattern.one instanceof Array ? rawPattern.one : [rawPattern.one]).map(parsePattern)
		}else{
			for(const [subpatternName, rawSubpattern] of Object.entries(rawPattern)){
				const pattern = namedPatterns[subpatternName] = parsePattern(rawSubpattern, subpatternName)
				if(name){
					pattern.aliases.push(name)
					if(namedPatterns[name]) pattern.aliases.push(...namedPatterns[name].aliases)
				}
			}
			type = 'one'
			data = Object.keys(rawPattern).map(parsePattern)
		}
	}else if(typeof rawPattern === 'string'){
		type = 'named or string'
		data = rawPattern
	}

	const pattern = {
		type,
		data,
		toString(){
			if(this.data instanceof Array) return `[${this.type}: ${this.data}]`
			else return typeof this.data
		}
	}
	if(name){
		pattern.name = name
		pattern.aliases = []
	}
	return pattern
}
parsePattern(grammar)

X('namedPatterns', namedPatterns, Object.keys(namedPatterns))

const oneOfAllNamedPatterns = {
	type: 'one',
	data: Object.keys(namedPatterns).map(patternName => ({
		type: 'named',
		data: patternName
	}))
}


// Sort pattern names by the priority of their corresopnding pattern
function sortNamedPatterns(patternNames){
	return patternNames
		.sortByMap(patternName => {
			const pattern = namedPatterns[patternName]
			if(pattern instanceof Array) return pattern.length
			if(Object.isPlainObject(Object)) return Object.keys(pattern).length
			return 1
		})
}


class ASTNode {
	constructor(options){
		Object.assign(this, options)
	}
	toString(){
		return `${this.type}( ${this.value instanceof Array ? this.value.join(', ') : this.value} )`
	}
	toDOM(){
		const $el = document.createElement('span')
		$el.setAttribute('type', this.type || `"${this.value}"`)
		if(this.value instanceof Array){
			for(const value of this.value){
				$el.append(
					( value instanceof ASTNode ? value : new ASTNode({value}) )
						.toDOM()
				)
			}
		}else{
			$el.innerText = this.value
		}
		return $el
	}
}

function parse(input){
	let symbols = [...input].filter(c => /\S/.test(c))

	function matchPattern(pattern, i, checkedNamedPatterns = []){
		if(i >= symbols.length) return 0
		
		const symbol = symbols[i]
		const data = pattern.data

		//l++
		console.groupCollapsed(`${pattern.type}: ${pattern.data}`, '|', symbol)

		const M = (() => {
			let M = 0

			switch(pattern.type){
			case 'named':
			case 'named or string':
				if(data in namedPatterns){
					// Reference
					const patternName = data

					X('symbol instanceof ASTNode', symbol instanceof ASTNode, namedPatterns[patternName].aliases, symbol.type)
					if(symbol instanceof ASTNode && namedPatterns[patternName].aliases.includes(symbol.type)) return 1
					if(symbol instanceof ASTNode && symbol.type === patternName) return 1.1

					if(checkedNamedPatterns.includes(patternName)) return 0 // named patterns can't contain themselves
					
					M = matchPattern(namedPatterns[patternName], i, [patternName, ...checkedNamedPatterns])
					
					if(M === 0) return 0

					// Replace matched symbols
					const node = new ASTNode()
					const replacedSymbols = symbols.splice(i, M, node)
					
					Object.assign(node, {
						type: patternName,//pattern.name,
						value: replacedSymbols.every(symbol => typeof symbol === 'string') ?
							replacedSymbols.join('') :
							replacedSymbols//.filter(s => s instanceof ASTNode)
					})
					
					return 1
				}else{
					// String
					for(const char of data){
						const symbol = symbols[i + M]
						if(typeof symbol === 'string' && char === symbol) M++
						else return 0
					}
					return M
				}
			case 'one':
				for(const pattern of data){
					const m = matchPattern(pattern, i, checkedNamedPatterns)
					//if(m === 1 && symbol instanceof ASTNode && symbol.type === pattern.data) continue
					if((m + '').endsWith('.1')) continue
					if(m > 0) return m
				}
				return 0
			case 'sequence':
				for(const subpattern of data){
					const required = subpattern.type !== 'optional'
					const m = matchPattern(required ? subpattern : subpattern.data, i + M, checkedNamedPatterns)
					if(required && m === 0) return 0
					M += m
				}
				return M

				/*let M = 0
				return data.every(subpattern => {
					if(subpattern.type === 'optional'){
						M += matchPattern(subpattern.data, i + M, checkedNamedPatterns)
						return true
					}else{
						const result = matchPattern(subpattern, i + M, checkedNamedPatterns)
						M += result
						return result > 0
					}
				}) * M*/
			case 'repeat':
				while(true){
					const result = matchPattern(data, i + M, checkedNamedPatterns)
					if(!result) return M
					M += result
				}
			case 'regex':
				return typeof symbol === 'string' && data.test(symbol) ? 1 : 0
			}
		})()

		if(M){
			X('YES!', M)
		}else{
			X('NO!')
		}
		console.groupEnd()//l--

		return M
	}

	//for(let _ = 0; _ < 1/*Object.keys(namedPatterns).length && symbols.length > 1*/; _++){
		/*for(const patternName of sortPatterns(Object.keys(namedPatterns))){
			for(let i = 0; i < symbols.length; i++){
				matchPattern({
					type: 'named',
					data: patternName
				}, i)
				X()
			}
		}*/
	//}

	//debug = false
	for(let _ = 0; _ < 2; _++){
	for(let i = 0; i < symbols.length; i++){
		matchPattern(oneOfAllNamedPatterns, i)
	}
	}
	
	console.log('symbols', symbols)

	return new ASTNode({
		type: 'EXPRESSION',
		value: symbols
	})
}



/*function symbolIterator(index = 0){
	return {
		index,
		symbol(offset = 0){
			return symbols[this.index + offset]
		},
		check(rule, offset){
			return symbolMatchesRule(this.symbol(offset), rule)
		},
		checkAndAdvance(rule){
			if(this.check(rule)){
				this.advance()
				return true
			}else{
				return false
			}
		},
		advance(){
			this.index++
		},
		copy(){
			return symbolIterator(this.index)
		}
	}
}*/
